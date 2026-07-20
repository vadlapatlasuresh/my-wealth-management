package com.mywealthmanagement.realestateservice.holding;

import com.mywealthmanagement.realestateservice.holding.dto.K1RecordDto;
import com.mywealthmanagement.realestateservice.holding.dto.K1YearSummaryDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The clock is fixed in every test. "Is this K-1 overdue?" depends on today's date relative
 * to the filing deadline, so a real clock would make these pass only part of the year.
 */
@ExtendWith(MockitoExtension.class)
class K1ServiceTest {

    @Mock
    private PrivateHoldingRepository holdingRepository;

    @Mock
    private K1RecordRepository k1Repository;

    /** 1 June 2026 — after the 15 Apr 2026 deadline for tax year 2025. */
    private static final Clock AFTER_2025_DEADLINE =
            Clock.fixed(Instant.parse("2026-06-01T12:00:00Z"), ZoneOffset.UTC);

    /** 1 Feb 2026 — before that deadline. */
    private static final Clock BEFORE_2025_DEADLINE =
            Clock.fixed(Instant.parse("2026-02-01T12:00:00Z"), ZoneOffset.UTC);

    private K1Service serviceAt(Clock clock) {
        return new K1Service(holdingRepository, k1Repository, clock);
    }

    private void authenticateAs(String userId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(userId, "Bearer t", AuthorityUtils.NO_AUTHORITIES));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private PrivateHolding holding(long id, String name, LocalDate acquired) {
        PrivateHolding h = new PrivateHolding();
        h.setId(id);
        h.setUserId(1L);
        h.setName(name);
        h.setEntityType("LLC");
        h.setStatus("ACTIVE");
        h.setSponsorName("Ridge Capital");
        h.setSponsorContact("ir@ridge.example.com");
        h.setAcquiredOn(acquired);
        h.setCreatedAt(LocalDateTime.of(2024, 1, 1, 0, 0));
        return h;
    }

    private K1Record record(long id, long holdingId, int year, String status) {
        K1Record r = new K1Record();
        r.setId(id);
        r.setHoldingId(holdingId);
        r.setUserId(1L);
        r.setTaxYear(year);
        r.setStatus(status);
        return r;
    }

    // ---- expected records are generated, not entered ----

    @Test
    void getYear_generatesAnExpectedK1ForEveryHoldingThatExistedThatYear() {
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                holding(10L, "Cedar Ridge LLC", LocalDate.of(2023, 5, 1)),
                holding(11L, "Harborview LP", LocalDate.of(2024, 8, 1))));
        when(k1Repository.findByUserIdAndTaxYearOrderByIdAsc(1L, 2025)).thenReturn(List.of());
        when(k1Repository.saveAll(any())).thenAnswer(inv -> {
            List<K1Record> in = inv.getArgument(0);
            long next = 500;
            for (K1Record r : in) r.setId(next++);
            return in;
        });

        authenticateAs("1");
        K1YearSummaryDto summary = serviceAt(AFTER_2025_DEADLINE).getYear(2025);

        assertThat(summary.getExpected()).isEqualTo(2);
        assertThat(summary.isReadyToFile()).isFalse();
        assertThat(summary.getOutstanding()).extracting(K1RecordDto::getHoldingName)
                .containsExactlyInAnyOrder("Cedar Ridge LLC", "Harborview LP");
    }

    @Test
    void getYear_doesNotClaimAK1ForAYearBeforeTheHoldingExisted() {
        // Bought in 2025 — nothing was owed for tax year 2024.
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                holding(10L, "Cedar Ridge LLC", LocalDate.of(2025, 3, 1))));
        when(k1Repository.findByUserIdAndTaxYearOrderByIdAsc(1L, 2024)).thenReturn(List.of());

        authenticateAs("1");
        K1YearSummaryDto summary = serviceAt(AFTER_2025_DEADLINE).getYear(2024);

        assertThat(summary.getExpected()).isZero();
        assertThat(summary.isReadyToFile()).isTrue();
        verify(k1Repository, never()).saveAll(any());
    }

    @Test
    void getYear_doesNotDuplicateAnAlreadyTrackedK1() {
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                holding(10L, "Cedar Ridge LLC", LocalDate.of(2023, 5, 1))));
        when(k1Repository.findByUserIdAndTaxYearOrderByIdAsc(1L, 2025))
                .thenReturn(List.of(record(1L, 10L, 2025, K1Service.RECEIVED)));

        authenticateAs("1");
        K1YearSummaryDto summary = serviceAt(AFTER_2025_DEADLINE).getYear(2025);

        assertThat(summary.getReceived()).isEqualTo(1);
        assertThat(summary.getExpected()).isZero();
        verify(k1Repository, never()).saveAll(any());
    }

    @Test
    void getYear_ignoresRecordsWhoseHoldingIsGone() {
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());
        when(k1Repository.findByUserIdAndTaxYearOrderByIdAsc(1L, 2025))
                .thenReturn(List.of(record(1L, 99L, 2025, K1Service.EXPECTED)));

        authenticateAs("1");
        K1YearSummaryDto summary = serviceAt(AFTER_2025_DEADLINE).getYear(2025);

        assertThat(summary.getExpected()).isZero();
        assertThat(summary.isReadyToFile()).isTrue();
    }

    // ---- filing readiness + overdue ----

    @Test
    void getYear_isReadyToFileOnlyWhenNothingIsOutstanding() {
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                holding(10L, "Cedar Ridge LLC", LocalDate.of(2023, 5, 1)),
                holding(11L, "Harborview LP", LocalDate.of(2023, 5, 1))));
        when(k1Repository.findByUserIdAndTaxYearOrderByIdAsc(1L, 2025)).thenReturn(List.of(
                record(1L, 10L, 2025, K1Service.RECEIVED),
                // A holding that simply does not issue one must not block the return.
                record(2L, 11L, 2025, K1Service.NOT_APPLICABLE)));

        authenticateAs("1");
        K1YearSummaryDto summary = serviceAt(AFTER_2025_DEADLINE).getYear(2025);

        assertThat(summary.isReadyToFile()).isTrue();
        assertThat(summary.getNotApplicable()).isEqualTo(1);
    }

    @Test
    void getYear_marksOutstandingK1sOverdueOnlyOnceTheDeadlineHasPassed() {
        lenient().when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                holding(10L, "Cedar Ridge LLC", LocalDate.of(2023, 5, 1))));
        lenient().when(k1Repository.findByUserIdAndTaxYearOrderByIdAsc(1L, 2025))
                .thenReturn(List.of(record(1L, 10L, 2025, K1Service.EXPECTED)));

        authenticateAs("1");
        assertThat(serviceAt(BEFORE_2025_DEADLINE).getYear(2025).getOverdue()).isZero();
        assertThat(serviceAt(AFTER_2025_DEADLINE).getYear(2025).getOverdue()).isEqualTo(1);
    }

    @Test
    void getYear_carriesTheSponsorContactSoTheUserCanChase() {
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                holding(10L, "Cedar Ridge LLC", LocalDate.of(2023, 5, 1))));
        when(k1Repository.findByUserIdAndTaxYearOrderByIdAsc(1L, 2025))
                .thenReturn(List.of(record(1L, 10L, 2025, K1Service.EXPECTED)));

        authenticateAs("1");
        assertThat(serviceAt(AFTER_2025_DEADLINE).getYear(2025).getOutstanding()).first()
                .satisfies(d -> {
                    assertThat(d.getSponsorName()).isEqualTo("Ridge Capital");
                    assertThat(d.getSponsorContact()).isEqualTo("ir@ridge.example.com");
                });
    }

    @Test
    void getYear_totalsOnlyTheFiguresFromReceivedK1s() {
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                holding(10L, "Cedar Ridge LLC", LocalDate.of(2023, 5, 1)),
                holding(11L, "Harborview LP", LocalDate.of(2023, 5, 1))));
        K1Record received = record(1L, 10L, 2025, K1Service.RECEIVED);
        received.setRentalIncome(new BigDecimal("12000"));
        received.setDistributions(new BigDecimal("9000"));
        K1Record stillWaiting = record(2L, 11L, 2025, K1Service.EXPECTED);
        stillWaiting.setRentalIncome(new BigDecimal("99999"));   // must not be counted
        when(k1Repository.findByUserIdAndTaxYearOrderByIdAsc(1L, 2025))
                .thenReturn(List.of(received, stillWaiting));

        authenticateAs("1");
        K1YearSummaryDto summary = serviceAt(AFTER_2025_DEADLINE).getYear(2025);

        assertThat(summary.getRentalIncome()).isEqualByComparingTo("12000");
        assertThat(summary.getDistributions()).isEqualByComparingTo("9000");
    }

    @Test
    void getYear_defaultsToTheMostRecentCompletedTaxYear() {
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());
        when(k1Repository.findByUserIdAndTaxYearOrderByIdAsc(1L, 2025)).thenReturn(List.of());

        authenticateAs("1");
        // Clock is in 2026, so the year being filed for is 2025.
        assertThat(serviceAt(AFTER_2025_DEADLINE).getYear(null).getTaxYear()).isEqualTo(2025);
    }

    // ---- updates ----

    @Test
    void update_marksReceivedAndDefaultsTheDateToToday() {
        K1Record stored = record(1L, 10L, 2025, K1Service.EXPECTED);
        when(k1Repository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(stored));
        lenient().when(holdingRepository.findByIdAndUserId(anyLong(), anyLong()))
                .thenReturn(Optional.of(holding(10L, "Cedar Ridge LLC", LocalDate.of(2023, 5, 1))));
        when(k1Repository.save(any(K1Record.class))).thenAnswer(inv -> inv.getArgument(0));

        K1RecordDto dto = new K1RecordDto();
        dto.setStatus("received");                  // lower-case; normalized
        dto.setRentalIncome(new BigDecimal("12000"));

        authenticateAs("1");
        K1RecordDto saved = serviceAt(AFTER_2025_DEADLINE).update(1L, dto);

        assertThat(saved.getStatus()).isEqualTo("RECEIVED");
        assertThat(saved.getReceivedOn()).isEqualTo(LocalDate.of(2026, 6, 1));
        assertThat(saved.getRentalIncome()).isEqualByComparingTo("12000");
        // A received K-1 is no longer overdue, whatever the date.
        assertThat(saved.getOverdue()).isFalse();
    }

    @Test
    void update_clearsTheReceivedDateWhenMovedBackToExpected() {
        K1Record stored = record(1L, 10L, 2025, K1Service.RECEIVED);
        stored.setReceivedOn(LocalDate.of(2026, 3, 1));
        when(k1Repository.findByIdAndUserId(1L, 1L)).thenReturn(Optional.of(stored));
        lenient().when(holdingRepository.findByIdAndUserId(anyLong(), anyLong())).thenReturn(Optional.empty());
        when(k1Repository.save(any(K1Record.class))).thenAnswer(inv -> inv.getArgument(0));

        K1RecordDto dto = new K1RecordDto();
        dto.setStatus("EXPECTED");

        authenticateAs("1");
        assertThat(serviceAt(AFTER_2025_DEADLINE).update(1L, dto).getReceivedOn()).isNull();
    }

    @Test
    void update_rejectsAnUnknownStatus() {
        when(k1Repository.findByIdAndUserId(1L, 1L))
                .thenReturn(Optional.of(record(1L, 10L, 2025, K1Service.EXPECTED)));
        K1RecordDto dto = new K1RecordDto();
        dto.setStatus("LOST_IN_THE_POST");

        authenticateAs("1");
        assertThatThrownBy(() -> serviceAt(AFTER_2025_DEADLINE).update(1L, dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid status");
    }

    @Test
    void update_deniesAnotherUsersK1() {
        when(k1Repository.findByIdAndUserId(1L, 2L)).thenReturn(Optional.empty());

        authenticateAs("2");
        assertThatThrownBy(() -> serviceAt(AFTER_2025_DEADLINE).update(1L, new K1RecordDto()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("K-1 not found");
    }

    // ---- year list ----

    @Test
    void availableYears_spansTheEarliestHoldingToTheLastCompletedYear() {
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of(
                holding(10L, "Cedar Ridge LLC", LocalDate.of(2023, 5, 1)),
                holding(11L, "Harborview LP", LocalDate.of(2024, 8, 1))));

        authenticateAs("1");
        assertThat(serviceAt(AFTER_2025_DEADLINE).availableYears())
                .containsExactly(2025, 2024, 2023);
    }

    @Test
    void availableYears_fallsBackToTheLastCompletedYearWithNoHoldings() {
        when(holdingRepository.findByUserIdOrderByCreatedAtDesc(1L)).thenReturn(List.of());

        authenticateAs("1");
        assertThat(serviceAt(AFTER_2025_DEADLINE).availableYears()).containsExactly(2025);
    }
}
