package com.mywealthmanagement.financialcoreservice.cpa;

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
}
