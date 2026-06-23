package com.mywealthmanagement.financialcoreservice.cpa;

import com.mywealthmanagement.financialcoreservice.cpa.verify.LicenseVerificationResult;
import com.mywealthmanagement.financialcoreservice.cpa.verify.LicenseVerifier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Pure unit coverage of the review-gating rules and rating recompute. Repos are mocked, so
 * no database is touched.
 */
@ExtendWith(MockitoExtension.class)
class CpaServiceTest {

    private static final Long CPA_ID = 7L;
    private static final Long USER_ID = 42L;

    @Mock private CpaProfileRepository profileRepository;
    @Mock private CpaReviewRepository reviewRepository;
    @Mock private CpaConnectionRepository connectionRepository;
    @Mock private LicenseVerifier licenseVerifier;

    @InjectMocks private CpaService service;

    private CpaProfile cpa() {
        CpaProfile c = new CpaProfile();
        c.setId(CPA_ID);
        c.setName("Maria Gonzalez");
        c.setLicenseVerified(true);
        return c;
    }

    @Test
    void addReview_rejectedWithoutConnection() {
        when(profileRepository.findById(CPA_ID)).thenReturn(Optional.of(cpa()));
        when(connectionRepository.existsByCpaIdAndUserId(CPA_ID, USER_ID)).thenReturn(false);

        assertThatThrownBy(() -> service.addReview(USER_ID, CPA_ID, 5, "Great"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("403");
    }

    @Test
    void addReview_acceptedAfterConnect_andRecomputesAverage() {
        CpaProfile profile = cpa();
        when(profileRepository.findById(CPA_ID)).thenReturn(Optional.of(profile));
        when(connectionRepository.existsByCpaIdAndUserId(CPA_ID, USER_ID)).thenReturn(true);
        when(reviewRepository.existsByCpaIdAndUserId(CPA_ID, USER_ID)).thenReturn(false);
        when(reviewRepository.save(any(CpaReview.class))).thenAnswer(inv -> inv.getArgument(0));

        // After saving, the CPA has two reviews: an existing 4 and the new 5 -> avg 4.50.
        CpaReview existing = new CpaReview();
        existing.setCpaId(CPA_ID);
        existing.setRating(4);
        CpaReview added = new CpaReview();
        added.setCpaId(CPA_ID);
        added.setRating(5);
        when(reviewRepository.findByCpaIdOrderByCreatedAtDesc(CPA_ID))
                .thenReturn(List.of(existing, added));

        CpaReview saved = service.addReview(USER_ID, CPA_ID, 5, "Excellent");

        assertThat(saved.getRating()).isEqualTo(5);
        assertThat(saved.isVerified()).isTrue();
        assertThat(profile.getReviewCount()).isEqualTo(2);
        assertThat(profile.getRatingAvg()).isEqualByComparingTo(new BigDecimal("4.50"));
    }

    @Test
    void addReview_rejectsInvalidRating() {
        when(profileRepository.findById(CPA_ID)).thenReturn(Optional.of(cpa()));

        assertThatThrownBy(() -> service.addReview(USER_ID, CPA_ID, 6, "too high"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void addReview_rejectsDuplicate() {
        when(profileRepository.findById(CPA_ID)).thenReturn(Optional.of(cpa()));
        when(connectionRepository.existsByCpaIdAndUserId(CPA_ID, USER_ID)).thenReturn(true);
        when(reviewRepository.existsByCpaIdAndUserId(CPA_ID, USER_ID)).thenReturn(true);

        assertThatThrownBy(() -> service.addReview(USER_ID, CPA_ID, 4, "again"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void register_createsPendingAndStripsClientTrustSignals() {
        when(profileRepository.save(any(CpaProfile.class))).thenAnswer(inv -> inv.getArgument(0));

        // A self-submitted draft that tries to spoof verification/approval/rating.
        CpaProfile draft = new CpaProfile();
        draft.setId(999L);
        draft.setName("New CPA");
        draft.setCredentials("CPA");
        draft.setLicenseState("TX");
        draft.setLicenseNumber("TX-1");
        draft.setContactEmail("new@firm.com");
        draft.setLicenseVerified(true);
        draft.setStatus("APPROVED");
        draft.setRatingAvg(new BigDecimal("5.00"));
        draft.setReviewCount(99);

        CpaProfile saved = service.register(USER_ID, draft);

        assertThat(saved.getStatus()).isEqualTo("PENDING");
        assertThat(saved.isLicenseVerified()).isFalse();
        assertThat(saved.getRatingAvg()).isNull();
        assertThat(saved.getReviewCount()).isZero();
        assertThat(saved.getId()).isNull();
        assertThat(saved.getSubmittedByUserId()).isEqualTo(USER_ID);
        assertThat(saved.getSubmittedAt()).isNotNull();
    }

    @Test
    void register_rejectsMissingRequiredFields() {
        CpaProfile draft = new CpaProfile();
        draft.setName("No license");
        draft.setCredentials("CPA");
        // missing licenseState/licenseNumber/contactEmail

        assertThatThrownBy(() -> service.register(USER_ID, draft))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void moderate_approveMakesListingVisible_andRunsVerification() {
        CpaProfile pending = cpa();
        pending.setStatus("PENDING");
        pending.setLicenseState("TX");
        pending.setLicenseNumber("TX-104882");
        when(profileRepository.findById(CPA_ID)).thenReturn(Optional.of(pending));
        when(profileRepository.save(any(CpaProfile.class))).thenAnswer(inv -> inv.getArgument(0));
        when(licenseVerifier.verify(any(), any(), any()))
                .thenReturn(new LicenseVerificationResult(true, "MOCK", "ok"));

        CpaProfile result = service.moderate(CPA_ID, true);

        assertThat(result.getStatus()).isEqualTo("APPROVED");
        assertThat(result.isLicenseVerified()).isTrue();
        assertThat(result.getVerificationSource()).isEqualTo("MOCK");
        assertThat(result.getLicenseVerifiedAt()).isNotNull();
    }

    @Test
    void verifyLicense_persistsOutcome_andClearsTimestampWhenUnverified() {
        CpaProfile cpa = cpa();
        cpa.setLicenseVerified(true);
        cpa.setLicenseVerifiedAt(java.time.LocalDateTime.now());
        when(profileRepository.findById(CPA_ID)).thenReturn(Optional.of(cpa));
        when(profileRepository.save(any(CpaProfile.class))).thenAnswer(inv -> inv.getArgument(0));
        when(licenseVerifier.verify(any(), any(), any()))
                .thenReturn(new LicenseVerificationResult(false, "NASBA_CPAVERIFY", "not found"));

        CpaProfile result = service.verifyLicense(CPA_ID);

        assertThat(result.isLicenseVerified()).isFalse();
        assertThat(result.getVerificationSource()).isEqualTo("NASBA_CPAVERIFY");
        assertThat(result.getLicenseVerifiedAt()).isNull();
    }
}
