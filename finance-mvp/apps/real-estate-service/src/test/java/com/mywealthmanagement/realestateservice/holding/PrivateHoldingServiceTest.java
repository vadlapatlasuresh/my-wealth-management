package com.mywealthmanagement.realestateservice.holding;

import com.mywealthmanagement.realestateservice.deal.Deal;
import com.mywealthmanagement.realestateservice.deal.DealRepository;
import com.mywealthmanagement.realestateservice.holding.dto.HoldingEntryDto;
import com.mywealthmanagement.realestateservice.holding.dto.PrivateHoldingDto;
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
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PrivateHoldingServiceTest {

    @Mock
    private PrivateHoldingRepository holdingRepository;

    @Mock
    private HoldingEntryRepository entryRepository;

    @Mock
    private DealRepository dealRepository;

    @InjectMocks
    private PrivateHoldingService service;

    private void authenticateAs(String userId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(userId, "Bearer t", AuthorityUtils.NO_AUTHORITIES));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private PrivateHolding holding() {
        PrivateHolding h = new PrivateHolding();
        h.setId(3L);
        h.setUserId(1L);
        h.setName("Cedar Ridge Land LLC");
        h.setEntityType("LLC");
        h.setStatus("ACTIVE");
        h.setCommittedAmount(new BigDecimal("100000"));
        h.setUnitsHeld(new BigDecimal("25"));
        h.setTotalUnits(new BigDecimal("200"));
        return h;
    }

    private HoldingEntry entry(String direction, String category, String amount) {
        HoldingEntry e = new HoldingEntry();
        e.setHoldingId(3L);
        e.setUserId(1L);
        e.setDirection(direction);
        e.setCategory(category);
        e.setAmount(new BigDecimal(amount));
        e.setOccurredOn(LocalDate.of(2026, 1, 15));
        return e;
    }

    // ---- capital account ----

    @Test
    void capitalAccount_separatesReturnedCapitalFromIncome() {
        // Put in 75k of a 100k commitment; got back 20k of basis and 12k of income.
        when(holdingRepository.findByIdAndUserId(3L, 1L)).thenReturn(Optional.of(holding()));
        when(entryRepository.findByHoldingIdOrderByOccurredOnDescIdDesc(3L)).thenReturn(List.of(
                entry("CONTRIBUTION", "INITIAL", "50000"),
                entry("CONTRIBUTION", "CAPITAL_CALL", "25000"),
                entry("DISTRIBUTION", "RETURN_OF_CAPITAL", "20000"),
                entry("DISTRIBUTION", "RENTAL_INCOME", "12000")));

        authenticateAs("1");
        PrivateHoldingDto dto = service.getHolding(3L);

        assertThat(dto.getContributed()).isEqualByComparingTo("75000");
        assertThat(dto.getDistributed()).isEqualByComparingTo("32000");
        assertThat(dto.getCapitalReturned()).isEqualByComparingTo("20000");
        // Rental income is profit on top of the basis, not a return of it.
        assertThat(dto.getIncomeReceived()).isEqualByComparingTo("12000");
        assertThat(dto.getUnreturnedCapital()).isEqualByComparingTo("55000");
        // 100k committed less 75k called.
        assertThat(dto.getUncalled()).isEqualByComparingTo("25000");
        assertThat(dto.getOwnershipPct()).isEqualByComparingTo("12.50");
        assertThat(dto.getDistributionRatio()).isEqualByComparingTo("0.4267");
    }

    @Test
    void capitalAccount_treatsRefinanceAndSaleProceedsAsReturnedCapital() {
        when(holdingRepository.findByIdAndUserId(3L, 1L)).thenReturn(Optional.of(holding()));
        when(entryRepository.findByHoldingIdOrderByOccurredOnDescIdDesc(3L)).thenReturn(List.of(
                entry("CONTRIBUTION", "INITIAL", "50000"),
                entry("DISTRIBUTION", "REFINANCE", "15000"),
                entry("DISTRIBUTION", "SALE_PROCEEDS", "10000"),
                entry("DISTRIBUTION", "CAPITAL_GAIN", "8000")));

        authenticateAs("1");
        PrivateHoldingDto dto = service.getHolding(3L);

        assertThat(dto.getCapitalReturned()).isEqualByComparingTo("25000");
        assertThat(dto.getIncomeReceived()).isEqualByComparingTo("8000");
        assertThat(dto.getUnreturnedCapital()).isEqualByComparingTo("25000");
    }

    @Test
    void capitalAccount_gettingBackMoreThanYouPutInLeavesNothingAtRisk() {
        when(holdingRepository.findByIdAndUserId(3L, 1L)).thenReturn(Optional.of(holding()));
        when(entryRepository.findByHoldingIdOrderByOccurredOnDescIdDesc(3L)).thenReturn(List.of(
                entry("CONTRIBUTION", "INITIAL", "50000"),
                entry("DISTRIBUTION", "SALE_PROCEEDS", "70000")));

        authenticateAs("1");
        // A fully-returned position is zero at risk, not a negative basis.
        assertThat(service.getHolding(3L).getUnreturnedCapital()).isEqualByComparingTo("0");
    }

    @Test
    void capitalAccount_isSafeWithNoEntriesYet() {
        when(holdingRepository.findByIdAndUserId(3L, 1L)).thenReturn(Optional.of(holding()));
        when(entryRepository.findByHoldingIdOrderByOccurredOnDescIdDesc(3L)).thenReturn(List.of());

        authenticateAs("1");
        PrivateHoldingDto dto = service.getHolding(3L);

        assertThat(dto.getContributed()).isEqualByComparingTo("0");
        assertThat(dto.getUncalled()).isEqualByComparingTo("100000");
        // No contributions means no ratio, rather than a divide-by-zero.
        assertThat(dto.getDistributionRatio()).isNull();
    }

    // ---- ledger validation ----

    @Test
    void addEntry_rejectsACategoryFromTheOtherDirection() {
        when(holdingRepository.findByIdAndUserId(3L, 1L)).thenReturn(Optional.of(holding()));
        HoldingEntryDto dto = new HoldingEntryDto();
        dto.setDirection("CONTRIBUTION");
        dto.setCategory("RENTAL_INCOME");           // a distribution category
        dto.setAmount(new BigDecimal("100"));
        dto.setOccurredOn(LocalDate.of(2026, 1, 1));

        authenticateAs("1");
        assertThatThrownBy(() -> service.addEntry(3L, dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid category");
    }

    @Test
    void addEntry_rejectsZeroOrNegativeAmounts() {
        lenient().when(holdingRepository.findByIdAndUserId(3L, 1L)).thenReturn(Optional.of(holding()));
        HoldingEntryDto dto = new HoldingEntryDto();
        dto.setDirection("DISTRIBUTION");
        dto.setAmount(BigDecimal.ZERO);
        dto.setOccurredOn(LocalDate.of(2026, 1, 1));

        authenticateAs("1");
        assertThatThrownBy(() -> service.addEntry(3L, dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("greater than zero");
    }

    @Test
    void addEntry_defaultsTheCategoryPerDirection() {
        when(holdingRepository.findByIdAndUserId(3L, 1L)).thenReturn(Optional.of(holding()));
        when(entryRepository.save(any(HoldingEntry.class))).thenAnswer(inv -> inv.getArgument(0));
        HoldingEntryDto dto = new HoldingEntryDto();
        dto.setDirection("contribution");            // lower-case; normalized
        dto.setAmount(new BigDecimal("500"));
        dto.setOccurredOn(LocalDate.of(2026, 1, 1));

        authenticateAs("1");
        assertThat(service.addEntry(3L, dto).getCategory()).isEqualTo("INITIAL");
    }

    // ---- ownership / IDOR ----

    @Test
    void update_deniesAnotherUsersHolding() {
        when(holdingRepository.findByIdAndUserId(3L, 2L)).thenReturn(Optional.empty());

        authenticateAs("2");
        assertThatThrownBy(() -> service.update(3L, new PrivateHoldingDto()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Holding not found");
    }

    @Test
    void create_rejectsUnitsHeldAboveTotalUnits() {
        PrivateHoldingDto dto = new PrivateHoldingDto();
        dto.setName("Cedar Ridge Land LLC");
        dto.setUnitsHeld(new BigDecimal("300"));
        dto.setTotalUnits(new BigDecimal("200"));

        authenticateAs("1");
        assertThatThrownBy(() -> service.create(dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("unitsHeld cannot exceed totalUnits");
    }

    // ---- the Deal Room sync ----

    private Deal openDeal() {
        Deal d = new Deal();
        d.setId(7L);
        d.setUserId(9L);
        d.setTitle("The Melissa Property");
        d.setCategory("REAL_ESTATE");
        d.setSubcategory("MULTIFAMILY");
        d.setLocation("Melissa, Texas");
        d.setWebsiteUrl("https://melissa.example.com/listing");
        d.setContactEmail("owner@melissa.example.com");
        d.setStatus("OPEN");
        return d;
    }

    @Test
    void trackFromDeal_prefillsDescriptiveFieldsAndBackReferencesTheListing() {
        when(dealRepository.findById(7L)).thenReturn(Optional.of(openDeal()));
        when(holdingRepository.existsByUserIdAndSourceDealId(1L, 7L)).thenReturn(false);
        when(holdingRepository.save(any(PrivateHolding.class))).thenAnswer(inv -> inv.getArgument(0));

        authenticateAs("1");
        PrivateHoldingDto dto = service.trackFromDeal(7L);

        assertThat(dto.getName()).isEqualTo("The Melissa Property");
        assertThat(dto.getAssetType()).isEqualTo("MULTIFAMILY");
        assertThat(dto.getLocation()).isEqualTo("Melissa, Texas");
        assertThat(dto.getExternalUrl()).isEqualTo("https://melissa.example.com/listing");
        assertThat(dto.getSourceDealId()).isEqualTo(7L);
        // Tracking records a decision; it does not assume any money has moved yet.
        assertThat(dto.getContributed()).isEqualByComparingTo("0");
    }

    @Test
    void trackFromDeal_isNotRepeatable() {
        lenient().when(dealRepository.findById(7L)).thenReturn(Optional.of(openDeal()));
        when(holdingRepository.existsByUserIdAndSourceDealId(1L, 7L)).thenReturn(true);

        authenticateAs("1");
        assertThatThrownBy(() -> service.trackFromDeal(7L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already tracking");
    }

    @Test
    void trackFromDeal_refusesAnotherUsersUnpublishedListing() {
        Deal draft = openDeal();
        draft.setStatus("DRAFT");
        when(dealRepository.findById(7L)).thenReturn(Optional.of(draft));

        authenticateAs("1"); // not the poster, and the listing is not public
        assertThatThrownBy(() -> service.trackFromDeal(7L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Deal not found");
    }

    // ---- portfolio rollup ----

    @Test
    void summary_rollsUpCapitalAndRanksSponsorConcentration() {
        PrivateHolding a = holding();
        a.setId(3L); a.setSponsorName("Ridge Capital"); a.setAssetType("MULTIFAMILY");
        PrivateHolding b = holding();
        b.setId(4L); b.setSponsorName("Ridge Capital"); b.setAssetType("LAND");
        PrivateHolding c = holding();
        c.setId(5L); c.setSponsorName("Harbor Group"); c.setAssetType("LAND");
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(a, b, c));

        HoldingEntry e3 = entry("CONTRIBUTION", "INITIAL", "60000");
        HoldingEntry e4 = entry("CONTRIBUTION", "INITIAL", "20000"); e4.setHoldingId(4L);
        HoldingEntry e5 = entry("CONTRIBUTION", "INITIAL", "20000"); e5.setHoldingId(5L);
        when(entryRepository.findByUserIdOrderByOccurredOnDescIdDesc(1L))
                .thenReturn(List.of(e3, e4, e5));

        authenticateAs("1");
        var summary = service.getSummary();

        assertThat(summary.getHoldingCount()).isEqualTo(3);
        assertThat(summary.getContributed()).isEqualByComparingTo("100000");
        // 80% of this investor's capital sits behind one sponsor — the point of the view.
        assertThat(summary.getBySponsor()).first()
                .satisfies(s -> {
                    assertThat(s.getLabel()).isEqualTo("Ridge Capital");
                    assertThat(s.getHoldings()).isEqualTo(2);
                    assertThat(s.getSharePct()).isEqualByComparingTo("80.00");
                });
    }
}
