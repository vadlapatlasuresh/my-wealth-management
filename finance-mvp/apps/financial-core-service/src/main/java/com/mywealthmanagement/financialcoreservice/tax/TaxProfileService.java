package com.mywealthmanagement.financialcoreservice.tax;

import com.mywealthmanagement.financialcoreservice.clients.AccountAggregationClient;
import com.mywealthmanagement.financialcoreservice.clients.dtos.TransactionDto;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

/** Persist a user's tax profile and suggest income from their linked-account deposits. */
@Service
@RequiredArgsConstructor
public class TaxProfileService {

    private static final Logger log = LoggerFactory.getLogger(TaxProfileService.class);

    private final TaxProfileRepository repository;
    private final AccountAggregationClient aggregationClient;

    public Optional<TaxProfile> get(Long userId) {
        return repository.findByUserId(userId);
    }

    @Transactional
    public TaxProfile upsert(Long userId, TaxProfile incoming) {
        TaxProfile p = repository.findByUserId(userId).orElseGet(TaxProfile::new);
        p.setUserId(userId);
        p.setTaxYear(incoming.getTaxYear() == null ? 2025 : incoming.getTaxYear());
        p.setFilingStatus(incoming.getFilingStatus());
        p.setGrossIncome(incoming.getGrossIncome());
        p.setAdjustments(incoming.getAdjustments());
        p.setItemizedDeductions(incoming.getItemizedDeductions());
        p.setDependentsUnder17(incoming.getDependentsUnder17());
        p.setWithholding(incoming.getWithholding());
        return repository.save(p);
    }

    /**
     * Rough estimated annual income from linked-account deposits (inflows are negative in
     * Plaid's convention). Best-effort: annualizes by the date range the transactions
     * cover. Returns null if it can't be derived — the UI presents it as a suggestion the
     * user confirms, never an authoritative figure.
     */
    public BigDecimal suggestAnnualIncome(String authHeader) {
        try {
            List<TransactionDto> txns = aggregationClient.getTransactions(authHeader);
            if (txns == null || txns.isEmpty()) return null;

            BigDecimal inflow = BigDecimal.ZERO;
            LocalDate min = null, max = null;
            for (TransactionDto t : txns) {
                if (t.getAmount() != null && t.getAmount().signum() < 0) {
                    inflow = inflow.add(t.getAmount().abs());
                }
                if (t.getDate() != null) {
                    if (min == null || t.getDate().isBefore(min)) min = t.getDate();
                    if (max == null || t.getDate().isAfter(max)) max = t.getDate();
                }
            }
            if (inflow.signum() == 0 || min == null) return null;

            long days = Math.max(1, ChronoUnit.DAYS.between(min, max));
            BigDecimal months = BigDecimal.valueOf(days).divide(BigDecimal.valueOf(30), 4, RoundingMode.HALF_UP)
                    .max(BigDecimal.ONE);
            BigDecimal annual = inflow.divide(months, 2, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(12));
            return annual.setScale(0, RoundingMode.HALF_UP);
        } catch (Exception e) {
            log.debug("income suggestion unavailable: {}", e.getMessage());
            return null;
        }
    }
}
