package com.mywealthmanagement.financialcoreservice.tax;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Records the latest estimate per user per tax year and serves the year-over-year history. */
@Service
@RequiredArgsConstructor
public class TaxEstimateHistoryService {

    private final TaxEstimateSnapshotRepository repository;

    /** Upsert the user's snapshot for this estimate's tax year (latest calculation wins). */
    @Transactional
    public TaxEstimateSnapshot record(Long userId, TaxEstimate est) {
        TaxEstimateSnapshot s = repository.findByUserIdAndTaxYear(userId, est.getYear())
                .orElseGet(TaxEstimateSnapshot::new);
        s.setUserId(userId);
        s.setTaxYear(est.getYear());
        s.setFilingStatus(est.getFilingStatus());
        s.setGrossIncome(est.getGrossIncome());
        s.setAgi(est.getAgi());
        s.setTaxableIncome(est.getTaxableIncome());
        s.setTotalTax(est.getTotalTax());
        s.setEffectiveRate(est.getEffectiveRate());
        s.setMarginalRate(est.getMarginalRate());
        s.setWithholding(est.getWithholding());
        s.setRefundOrOwed(est.getRefundOrOwed());
        return repository.save(s);
    }

    /** The user's saved estimates, most recent tax year first. */
    public List<TaxEstimateSnapshot> list(Long userId) {
        return repository.findByUserIdOrderByTaxYearDesc(userId);
    }
}
