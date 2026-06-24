package com.mywealthmanagement.financialcoreservice.tax;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** Upsert-by-year behavior for the estimate history. Repo mocked — no database. */
@ExtendWith(MockitoExtension.class)
class TaxEstimateHistoryServiceTest {

    private static final Long USER = 42L;

    @Mock private TaxEstimateSnapshotRepository repository;
    @InjectMocks private TaxEstimateHistoryService service;

    private TaxEstimate estimate(int year, String tax, String refund) {
        TaxEstimate e = new TaxEstimate();
        e.setYear(year);
        e.setFilingStatus("SINGLE");
        e.setGrossIncome(new BigDecimal("84000"));
        e.setAgi(new BigDecimal("84000"));
        e.setTaxableIncome(new BigDecimal("69000"));
        e.setTaxAfterCredits(new BigDecimal(tax));
        e.setEffectiveRate(new BigDecimal("0.12"));
        e.setMarginalRate(new BigDecimal("0.22"));
        e.setWithholding(new BigDecimal("10000"));
        e.setRefundOrOwed(new BigDecimal(refund));
        return e;
    }

    @Test
    void record_createsNewSnapshotWhenNoneForYear() {
        when(repository.findByUserIdAndTaxYear(USER, 2025)).thenReturn(Optional.empty());
        when(repository.save(any(TaxEstimateSnapshot.class))).thenAnswer(inv -> inv.getArgument(0));

        TaxEstimateSnapshot saved = service.record(USER, estimate(2025, "9000", "1000"));

        assertThat(saved.getUserId()).isEqualTo(USER);
        assertThat(saved.getTaxYear()).isEqualTo(2025);
        assertThat(saved.getTotalTax()).isEqualByComparingTo("9000");
        assertThat(saved.getRefundOrOwed()).isEqualByComparingTo("1000");
    }

    @Test
    void record_updatesExistingSnapshotForSameYear() {
        TaxEstimateSnapshot existing = new TaxEstimateSnapshot();
        existing.setId(5L);
        existing.setUserId(USER);
        existing.setTaxYear(2025);
        existing.setTotalTax(new BigDecimal("9000"));
        when(repository.findByUserIdAndTaxYear(USER, 2025)).thenReturn(Optional.of(existing));
        when(repository.save(any(TaxEstimateSnapshot.class))).thenAnswer(inv -> inv.getArgument(0));

        ArgumentCaptor<TaxEstimateSnapshot> captor = ArgumentCaptor.forClass(TaxEstimateSnapshot.class);
        service.record(USER, estimate(2025, "7500", "2500"));

        org.mockito.Mockito.verify(repository).save(captor.capture());
        // Same row reused (id preserved), figures refreshed.
        assertThat(captor.getValue().getId()).isEqualTo(5L);
        assertThat(captor.getValue().getTotalTax()).isEqualByComparingTo("7500");
        assertThat(captor.getValue().getRefundOrOwed()).isEqualByComparingTo("2500");
    }
}
