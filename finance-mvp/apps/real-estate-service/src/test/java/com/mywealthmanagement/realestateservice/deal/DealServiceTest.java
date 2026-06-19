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

import java.math.BigDecimal;
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
    private DealDocumentRepository documentRepository;

    @Mock
    private DealWatchRepository watchRepository;

    @Mock
    private LeadNotifier leadNotifier;

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
        dto.setTargetRaise(new BigDecimal("250000"));
        dto.setMinInvestment(new BigDecimal("25000"));
        dto.setTargetIrr(new BigDecimal("18.5"));
        dto.setHoldPeriodMonths(48);
        return dto;
    }

    @Test
    void createDeal_setsOwnerNormalizesCategoryAndDefaultsStatus() {
        authenticateAs("1");
        when(dealRepository.save(any(Deal.class))).thenAnswer(inv -> inv.getArgument(0));

        DealDto created = service.createDeal(validDto());

        assertThat(created.getCategory()).isEqualTo("REAL_ESTATE");
        assertThat(created.getStatus()).isEqualTo("DRAFT");
        assertThat(created.getAmountCommitted()).isEqualByComparingTo("0");
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

    @Test
    void createDeal_rejectsNegativeTargetRaise() {
        authenticateAs("1");
        DealDto dto = validDto();
        dto.setTargetRaise(new BigDecimal("-1"));

        assertThatThrownBy(() -> service.createDeal(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("cannot be negative");
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
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("http");
    }

    @Test
    void updateDeal_deniesAccessToAnotherUsersDeal() {
        // Deal owned by user 1.
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
        deal.setTitle("Open Deal");
        deal.setCategory("REAL_ESTATE");
        deal.setStatus("OPEN");
        return deal;
    }

    private DealInterestRequest interestRequest() {
        DealInterestRequest req = new DealInterestRequest();
        req.setName("Jane Investor");
        req.setEmail("jane@example.com");
        req.setPhone("+1 555 0100");
        req.setMessage("Interested — please send the PPM.");
        req.setCommitmentAmount(new BigDecimal("50000"));
        req.setAccredited(true);
        return req;
    }

    @Test
    void expressInterest_capturesLeadAndSharesWithOwner() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));
        when(interestRepository.save(any(DealInterest.class))).thenAnswer(inv -> inv.getArgument(0));

        authenticateAs("2"); // a different user expresses interest
        DealInterestDto lead = service.expressInterest(7L, interestRequest());

        assertThat(lead.getName()).isEqualTo("Jane Investor");
        assertThat(lead.getEmail()).isEqualTo("jane@example.com");
        assertThat(lead.getPhone()).isEqualTo("+1 555 0100");
    }

    @Test
    void expressInterest_rejectedWhenDealNotOpen() {
        Deal draft = openDealOwnedBy(1L);
        draft.setStatus("DRAFT");
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(draft));

        authenticateAs("2");
        assertThatThrownBy(() -> service.expressInterest(7L, interestRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not open");
    }

    @Test
    void expressInterest_rejectedForOwnDeal() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));

        authenticateAs("1"); // the owner cannot express interest in their own deal
        assertThatThrownBy(() -> service.expressInterest(7L, interestRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("You own this deal");
    }

    @Test
    void getInterests_deniedForNonOwner() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));

        authenticateAs("2"); // not the owner -> 404, no leads leaked
        assertThatThrownBy(() -> service.getInterests(7L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Deal not found");
    }

    // ---- taxonomy + return structure ----

    @Test
    void createDeal_acceptsValidSubcategoryAndFixedReturnRange() {
        authenticateAs("1");
        when(dealRepository.save(any(Deal.class))).thenAnswer(inv -> inv.getArgument(0));

        DealDto dto = validDto();
        dto.setCategory("REAL_ESTATE");
        dto.setSubcategory("multifamily");          // lower-case; normalized
        dto.setReturnType("fixed");
        dto.setAnnualReturnMin(new BigDecimal("12"));
        dto.setAnnualReturnMax(new BigDecimal("24"));
        dto.setDistributionFrequency("quarterly");

        DealDto created = service.createDeal(dto);
        assertThat(created.getSubcategory()).isEqualTo("MULTIFAMILY");
        assertThat(created.getReturnType()).isEqualTo("FIXED");
        assertThat(created.getAnnualReturnMin()).isEqualByComparingTo("12");
        assertThat(created.getAnnualReturnMax()).isEqualByComparingTo("24");
        assertThat(created.getDistributionFrequency()).isEqualTo("QUARTERLY");
    }

    @Test
    void createDeal_rejectsSubcategoryNotInCategory() {
        authenticateAs("1");
        DealDto dto = validDto();
        dto.setCategory("REAL_ESTATE");
        dto.setSubcategory("VENTURE"); // a private-equity subcategory, not real estate

        assertThatThrownBy(() -> service.createDeal(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid subcategory");
    }

    @Test
    void createDeal_rejectsReturnMinAboveMax() {
        authenticateAs("1");
        DealDto dto = validDto();
        dto.setAnnualReturnMin(new BigDecimal("24"));
        dto.setAnnualReturnMax(new BigDecimal("12"));

        assertThatThrownBy(() -> service.createDeal(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("cannot exceed");
    }

    @Test
    void marketplace_filtersByCategoryAndSubcategory() {
        Deal a = openDealOwnedBy(1L); a.setId(1L); a.setCategory("REAL_ESTATE"); a.setSubcategory("MULTIFAMILY");
        Deal b = openDealOwnedBy(1L); b.setId(2L); b.setCategory("REAL_ESTATE"); b.setSubcategory("LAND");
        Deal c = openDealOwnedBy(1L); c.setId(3L); c.setCategory("STARTUP"); c.setSubcategory("SEED");
        when(dealRepository.findByStatusOrderByCreatedAtDesc("OPEN")).thenReturn(java.util.List.of(a, b, c));

        authenticateAs("9");
        assertThat(service.getMarketplace("REAL_ESTATE", "MULTIFAMILY", null, null, null, null)).hasSize(1);
        assertThat(service.getMarketplace("REAL_ESTATE", null, null, null, null, null)).hasSize(2);
        assertThat(service.getMarketplace(null, null, null, null, null, null)).hasSize(3);
        // Pagination: limit 2 of 3.
        assertThat(service.getMarketplace(null, null, null, "NEWEST", 2, 0)).hasSize(2);
    }

    // ---- two-sided interest workflow ----

    @Test
    void expressInterest_rejectsDuplicate() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));
        when(interestRepository.existsByDealIdAndInterestedUserId(7L, 2L)).thenReturn(true);

        authenticateAs("2");
        assertThatThrownBy(() -> service.expressInterest(7L, interestRequest()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already expressed");
    }

    @Test
    void updateLeadStatus_ownerUpdates_andRejectsInvalid() {
        DealInterest interest = new DealInterest();
        interest.setId(3L); interest.setDealId(7L); interest.setStatus("NEW");
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));
        lenient().when(interestRepository.findById(3L)).thenReturn(Optional.of(interest));
        lenient().when(interestRepository.save(any(DealInterest.class))).thenAnswer(inv -> inv.getArgument(0));

        authenticateAs("1");
        assertThat(service.updateLeadStatus(7L, 3L, "contacted").getStatus()).isEqualTo("CONTACTED");
        assertThatThrownBy(() -> service.updateLeadStatus(7L, 3L, "BOGUS"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid lead status");
    }

    @Test
    void expressInterest_rejectedWithoutAccreditation() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));
        DealInterestRequest req = interestRequest();
        req.setAccredited(false);

        authenticateAs("2");
        assertThatThrownBy(() -> service.expressInterest(7L, req))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("accredited");
    }

    @Test
    void expressInterest_capturesCommitmentAndNotifiesSponsor() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));
        when(interestRepository.save(any(DealInterest.class))).thenAnswer(inv -> inv.getArgument(0));

        authenticateAs("2");
        var lead = service.expressInterest(7L, interestRequest());

        assertThat(lead.getCommitmentAmount()).isEqualByComparingTo("50000");
        assertThat(lead.isAccredited()).isTrue();
        org.mockito.Mockito.verify(leadNotifier).notifyNewInterest(eq(1L), any(), eq("Jane Investor"));
    }

    @Test
    void watch_isIdempotent_andUnwatchScopedToUser() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDealOwnedBy(1L)));
        when(watchRepository.existsByUserIdAndDealId(2L, 7L)).thenReturn(false, true);

        authenticateAs("2");
        service.watch(7L);
        service.watch(7L); // already watched -> no second save
        org.mockito.Mockito.verify(watchRepository, org.mockito.Mockito.times(1)).save(any(DealWatch.class));

        service.unwatch(7L);
        org.mockito.Mockito.verify(watchRepository).deleteByUserIdAndDealId(2L, 7L);
    }

    @Test
    void getMyInterests_includesDealTitle() {
        DealInterest interest = new DealInterest();
        interest.setId(3L); interest.setDealId(7L); interest.setStatus("NEW"); interest.setName("Jane");
        when(interestRepository.findByInterestedUserIdOrderByCreatedAtDesc(2L)).thenReturn(java.util.List.of(interest));
        Deal deal = openDealOwnedBy(1L);
        when(dealRepository.findAllById(any())).thenReturn(java.util.List.of(deal));

        authenticateAs("2");
        var mine = service.getMyInterests();
        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).getDealTitle()).isEqualTo("Open Deal");
        assertThat(mine.get(0).getStatus()).isEqualTo("NEW");
    }
}
