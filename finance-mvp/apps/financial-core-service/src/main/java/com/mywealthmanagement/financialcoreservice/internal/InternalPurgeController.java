package com.mywealthmanagement.financialcoreservice.internal;

import com.mywealthmanagement.financialcoreservice.budget.BudgetRepository;
import com.mywealthmanagement.financialcoreservice.debt.DebtRepository;
import com.mywealthmanagement.financialcoreservice.debt.DebtScenarioRepository;
import com.mywealthmanagement.financialcoreservice.financialcore.NetWorthSnapshotRepository;
import com.mywealthmanagement.financialcoreservice.goals.GoalRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Purges all financial-core data for a user on account deletion. X-Internal-Key guarded. */
@RestController
@RequestMapping("/internal/users")
@RequiredArgsConstructor
public class InternalPurgeController {

    private final BudgetRepository budgetRepository;
    private final DebtRepository debtRepository;
    private final DebtScenarioRepository debtScenarioRepository;
    private final GoalRepository goalRepository;
    private final NetWorthSnapshotRepository netWorthSnapshotRepository;
    private final com.mywealthmanagement.financialcoreservice.tax.TaxProfileRepository taxProfileRepository;
    private final com.mywealthmanagement.financialcoreservice.cpa.CpaReviewRepository cpaReviewRepository;
    private final com.mywealthmanagement.financialcoreservice.cpa.CpaConnectionRepository cpaConnectionRepository;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    private void requireInternal(String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
    }

    /** GDPR data export: this service's data for the user. */
    @GetMapping("/{userId}/export")
    public ResponseEntity<java.util.Map<String, Object>> export(@PathVariable Long userId,
                                                                @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireInternal(key);
        return ResponseEntity.ok(java.util.Map.of(
                "goals", goalRepository.findByUserIdOrderByCreatedAtAsc(userId),
                "debts", debtRepository.findByUserId(userId),
                "netWorthSnapshots", netWorthSnapshotRepository.findByUserIdOrderBySnapshotDateAsc(userId)));
    }

    @DeleteMapping("/{userId}")
    @Transactional
    public ResponseEntity<Void> purge(@PathVariable Long userId,
                                      @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        debtScenarioRepository.deleteByUserId(userId);
        debtRepository.deleteByUserId(userId);
        budgetRepository.deleteByUserId(userId);          // budget lines cascade via JPA
        goalRepository.deleteByUserId(userId);
        netWorthSnapshotRepository.deleteByUserId(userId);
        taxProfileRepository.deleteByUserId(userId);
        cpaReviewRepository.deleteByUserId(userId);
        cpaConnectionRepository.deleteByUserId(userId);
        return ResponseEntity.noContent().build();
    }
}
