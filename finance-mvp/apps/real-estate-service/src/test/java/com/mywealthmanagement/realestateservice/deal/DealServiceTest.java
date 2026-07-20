package com.mywealthmanagement.realestateservice.deal;

import com.mywealthmanagement.realestateservice.deal.dto.DealDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealInterestDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealInterestRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DealServiceTest {

    @Mock
    private DealRepository dealRepository;

    @Mock
    private DealInterestRepository interestRepository;

    @Mock
    private com.mywealthmanagement.realestateservice.sponsor.SponsorProjectRepository sponsorProjectRepository;

    @Mock
    private DealWatchRepository watchRepository;

    @Mock
    private LeadNotifier leadNotifier;

    @Mock
    private com.mywealthmanagement.realestateservice.comms.NotificationClient notificationClient;

    @Mock
    private DealBroadcaster dealBroadcaster;

    @Mock
    private com.mywealthmanagement.realestateservice.audit.AuditClient auditClient;

    @InjectMocks
    private DealService service;

    private void authenticateAs(String userId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(userId, "Bearer t", AuthorityUtils.NO_AUTHORITIES));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private DealDto validDto() {
        DealDto dto = new DealDto();
        dto.setTitle("Cedar Ridge Farmland");
        dto.setCategory("real_estate");          // lower-case on purpose; should normalize
        dto.setLocation("Bozeman, MT");
        dto.setDescription("40 acres of pasture with county road frontage.");
        dto.setWebsiteUrl("https://cedarridge.example.com/listing");
        dto.setContactEmail("owner@example.com");
        return dto;
    }

    @Test
    void createDeal_setsOwnerNormalizesCategoryAndDefaultsStatus() {
        authenticateAs("1");
        when(dealRepository.save(any(Deal.class))).thenAnswer(inv -> inv.getArgument(0));

        DealDto created = service.createDeal(validDto());

        assertThat(created.getCategory()).isEqualTo("REAL_ESTATE");
        assertThat(created.getStatus()).isEqualTo("DRAFT");
    }

    @Test
    void createDeal_rejectsMissingTitle() {
        authenticateAs("1");
        DealDto dto = validDto();
        dto.setTitle("   ");

        assertThatThrownBy(() -> service.createDeal(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Title is required");
    }

    // ---- compliance: a listing is a pointer off-platform, never a set of terms ----

    @Test
    void createDeal_requiresAnExternalListingUrl() {
        authenticateAs("1");
        DealDto dto = validDto();
        dto.setWebsiteUrl(null);

        assertThatThrownBy(() -> service.createDeal(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("external listing URL is required");
    }

    @Test
    void createDeal_requiresAContactRouteForInquiries() {
        authenticateAs("1");
        DealDto dto = validDto();
        dto.setContactEmail(null);
        dto.setContactPhone(null);

        assertThatThrownBy(() -> service.createDeal(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("contact email or phone");
    }

    @Test
    void createDeal_acceptsPhoneOnlyContact() {
        authenticateAs("1");
        when(dealRepository.save(any(Deal.class))).thenAnswer(inv -> inv.getArgument(0));

        DealDto dto = validDto();
        dto.setContactEmail(null);
        dto.setContactPhone("+1 555 0100");

        assertThat(service.createDeal(dto).getContactPhone()).isEqualTo("+1 555 0100");
    }

    @Test
    void createDeal_rejectsMalformedContactEmail() {
        authenticateAs("1");
        DealDto dto = validDto();
        dto.setContactEmail("not-an-email");

        assertThatThrownBy(() -> service.createDeal(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("valid email");
    }

    @Test
    void createDeal_roundTripsImageUrls() {
        authenticateAs("1");
        when(dealRepository.save(any(Deal.class))).thenAnswer(inv -> inv.getArgument(0));

        DealDto dto = validDto();
        dto.setImageUrls(java.util.List.of("https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"));

        assertThat(service.createDeal(dto).getImageUrls())
                .containsExactly("https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg");
    }

    @Test
    void createDeal_rejectsUnsafeImageUrlScheme() {
        authenticateAs("1");
        DealDto dto = validDto();
        dto.setImageUrls(java.util.List.of("https://cdn.example.com/a.jpg", "javascript:alert(1)"));

        assertThatThrownBy(() -> service.createDeal(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("imageUrls");
    }

    @Test
    void createDeal_acceptsHttpsWebsite_butRejectsUnsafeScheme() {
        authenticateAs("1");
        when(dealRepository.save(any(Deal.class))).thenAnswer(inv -> inv.getArgument(0));

        DealDto ok = validDto();
        ok.setWebsiteUrl("https://cedarridge.example.com/deal");
        assertThat(service.createDeal(ok).getWebsiteUrl()).isEqualTo("https://cedarridge.example.com/deal");

        DealDto bad = validDto();
        bad.setWebsiteUrl("javascript:alert(1)");
        assertThatThrownBy(() -> service.createDeal(bad))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void updateDeal_deniesAccessToAnotherUsersDeal() {
        // Listing owned by user 1.
        Deal owned = new Deal();
        owned.setId(7L);
        owned.setUserId(1L);
        owned.setTitle("Owned");
        owned.setCategory("REAL_ESTATE");
        owned.setStatus("OPEN");
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(owned));

        // User 2 attempts to update it -> 404 (no existence leak).
        authenticateAs("2");
        assertThatThrownBy(() -> service.updateDeal(7L, validDto()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Deal not found");
    }

    private Deal openDealOwnedBy(long ownerId) {
        Deal deal = new Deal();
        deal.setId(7L);
        deal.setUserId(ownerId);
        deal.setTitle("Open Listing");
        deal.setCategory("REAL_ESTATE");
        deal.setWebsiteUrl("https://example.com/listing");
        deal.setContactEmail("owner@example.com");
        deal.setStatus("OPEN");
        return deal;
    }

    private DealInterestRequest interestRequest() {
        DealInterestRequest req = new DealInterestRequest();
        req.setName("Jane Doe");
        req.setEmail("jane@example.com");
        req.setPhone("+1 555 0100");
        req.setMessage("Is the parcel still available?");
        return req;
    }

    // ---- taxonomy ----

    @Test
    void createDeal_acceptsValidPropertyType() {
        authenticateAs("1");
        when(dealRepository.save(any(Deal.class))).thenAnswer(inv -> inv.getArgument(0));

        DealDto dto = validDto();
        dto.setCategory("REAL_ESTATE");
        dto.setSubcategory("multifamily");          // lower-case; normalized

        assertThat(service.createDeal(dto).getSubcategory()).isEqualTo("MULTIFAMILY");
    }

    @Test
    void createDeal_rejectsSubcategoryNotInCategory() {
        authenticateAs("1");
        DealDto dto = validDto();
        dto.setCategory("REAL_ESTATE");
        dto.setSubcategory("RETAIL"); // a business property type, not real estate

        assertThatThrownBy(() -> service.createDeal(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid subcategory");
    }

    @Test
    void createDeal_rejectsRetiredSecuritiesCategories() {
        authenticateAs("1");
        DealDto dto = validDto();
        dto.setCategory("PRIVATE_EQUITY");

        assertThatThrownBy(() -> service.createDeal(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid value");
    }

    @Test
    void directory_filtersByCategoryAndPropertyType() {
        Deal a = openDealOwnedBy(1L); a.setId(1L); a.setCategory("REAL_ESTATE"); a.setSubcategory("MULTIFAMILY");
        Deal b = openDealOwnedBy(1L); b.setId(2L); b.setCategory("REAL_ESTATE"); b.setSubcategory("LAND");
        Deal c = openDealOwnedBy(1L); c.setId(3L); c.setCategory("BUSINESS"); c.setSubcategory("RETAIL");
        when(dealRepository.findByStatusOrderByCreatedAtDesc("OPEN")).thenReturn(java.util.List.of(a, b, c));

        authenticateAs("9");
        assertThat(service.getMarketplace("REAL_ESTATE", "MULTIFAMILY", null, null)).hasSize(1);
        assertThat(service.getMarketplace("REAL_ESTATE", null, null, null)).hasSize(2);
        assertThat(service.getMarketplace(null, null, null, null)).hasSize(3);
        // Pagination: limit 2 of 3.
        assertThat(service.getMarketplace(null, null, 2, 0)).hasSize(2);
    }

    // ---- contact requests ----

    @Test
    void requestContactInfo_recordsTheRequestAndNotifiesThePoster() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));
        when(interestRepository.save(any(DealInterest.class))).thenAnswer(inv -> inv.getArgument(0));

        authenticateAs("2"); // a different user asks for the contact details
        DealInterestDto record = service.requestContactInfo(7L, interestRequest());

        assertThat(record.getName()).isEqualTo("Jane Doe");
        assertThat(record.getEmail()).isEqualTo("jane@example.com");
        assertThat(record.getPhone()).isEqualTo("+1 555 0100");
        org.mockito.Mockito.verify(leadNotifier).notifyNewInterest(eq(1L), any(), eq("Jane Doe"));
    }

    @Test
    void requestContactInfo_rejectedWhenListingNotPublished() {
        Deal draft = openDealOwnedBy(1L);
        draft.setStatus("DRAFT");
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(draft));

        authenticateAs("2");
        assertThatThrownBy(() -> service.requestContactInfo(7L, interestRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not published");
    }

    @Test
    void requestContactInfo_rejectedForOwnListing() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));

        authenticateAs("1");
        assertThatThrownBy(() -> service.requestContactInfo(7L, interestRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("You posted this listing");
    }

    @Test
    void requestContactInfo_rejectsDuplicate() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));
        when(interestRepository.existsByDealIdAndInterestedUserId(7L, 2L)).thenReturn(true);

        authenticateAs("2");
        assertThatThrownBy(() -> service.requestContactInfo(7L, interestRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already requested");
    }

    @Test
    void watch_isIdempotent_andUnwatchScopedToUser() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));
        when(watchRepository.existsByUserIdAndDealId(2L, 7L)).thenReturn(false, true);

        authenticateAs("2");
        service.watch(7L);
        service.watch(7L); // already saved -> no second save
        org.mockito.Mockito.verify(watchRepository, org.mockito.Mockito.times(1)).save(any(DealWatch.class));

        service.unwatch(7L);
        org.mockito.Mockito.verify(watchRepository).deleteByUserIdAndDealId(2L, 7L);
    }

    @Test
    void getMyInterests_includesListingTitle() {
        DealInterest interest = new DealInterest();
        interest.setId(3L); interest.setDealId(7L); interest.setName("Jane");
        when(interestRepository.findByInterestedUserIdOrderByCreatedAtDesc(2L)).thenReturn(java.util.List.of(interest));
        when(dealRepository.findAllById(any())).thenReturn(java.util.List.of(openDealOwnedBy(1L)));

        authenticateAs("2");
        var mine = service.getMyInterests();
        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).getDealTitle()).isEqualTo("Open Listing");
    }

    @Test
    void taxonomy_exposesNoReturnStructure() {
        var taxonomy = service.getTaxonomy();
        assertThat(taxonomy).containsOnlyKeys("categories", "subcategories", "statuses");
    }
}
