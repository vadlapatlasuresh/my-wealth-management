package com.mywealthmanagement.businessfinancialsservice.business.manual;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Applies transaction categorization rules (Phase 3a): resolves a category for one transaction,
 * and bulk-applies rules to a business's uncategorized manual transactions.
 */
@Service
@RequiredArgsConstructor
public class TxnRuleService {

    private final BusinessTxnRuleRepository ruleRepo;
    private final BusinessTransactionRepository txnRepo;

    /** Category for the given merchant/description from this business's rules, or null. */
    @Transactional(readOnly = true)
    public String resolveCategory(Long businessId, Long userId, String merchant, String description) {
        List<BusinessTxnRule> rules = ruleRepo.findByBusinessIdAndUserIdOrderByPositionAscIdAsc(businessId, userId);
        if (rules.isEmpty()) return null;
        return TxnRuleMatcher.resolve(rules, merchant, description);
    }

    /** Applies the rules to every manual transaction with no category. Returns the number updated. */
    @Transactional
    public int applyToUncategorized(Long businessId, Long userId) {
        List<BusinessTxnRule> rules = ruleRepo.findByBusinessIdAndUserIdOrderByPositionAscIdAsc(businessId, userId);
        if (rules.isEmpty()) return 0;
        int updated = 0;
        for (BusinessTransaction t : txnRepo.findByBusinessIdAndUserIdOrderByPostedAtDescIdDesc(businessId, userId)) {
            if (t.getCategory() != null && !t.getCategory().isBlank()) continue;
            String cat = TxnRuleMatcher.resolve(rules, t.getMerchant(), t.getDescription());
            if (cat != null) {
                t.setCategory(cat);
                txnRepo.save(t);
                updated++;
            }
        }
        return updated;
    }
}
