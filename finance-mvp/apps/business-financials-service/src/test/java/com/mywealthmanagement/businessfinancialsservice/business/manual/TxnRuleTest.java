package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Transaction categorization rules (Phase 3a): matching + bulk apply. */
@ExtendWith(MockitoExtension.class)
class TxnRuleTest {

    private static final long USER = 1L;
    private static final long BIZ = 7L;

    @Mock private BusinessTxnRuleRepository ruleRepo;
    @Mock private BusinessTransactionRepository txnRepo;
    @InjectMocks private TxnRuleService service;

    private BusinessTxnRule rule(String field, String type, String value, String category, int pos) {
        BusinessTxnRule r = new BusinessTxnRule();
        r.setUserId(USER); r.setBusinessId(BIZ);
        r.setMatchField(field); r.setMatchType(type); r.setMatchValue(value); r.setSetCategory(category);
        r.setPosition(pos); r.setActive(true);
        return r;
    }

    private BusinessTransaction txn(String merchant, String desc, String category) {
        BusinessTransaction t = new BusinessTransaction();
        t.setUserId(USER); t.setBusinessId(BIZ);
        t.setMerchant(merchant); t.setDescription(desc); t.setCategory(category);
        t.setAmount(new BigDecimal("-50"));
        return t;
    }

    @Test
    void matcher_firstMatchWins_caseInsensitive() {
        List<BusinessTxnRule> rules = List.of(
                rule("MERCHANT", "CONTAINS", "aws", "Software & Subscriptions", 0),
                rule("DESCRIPTION", "STARTS_WITH", "Payroll", "Payroll", 1));
        assertThat(TxnRuleMatcher.resolve(rules, "AWS EMEA", "cloud")).isEqualTo("Software & Subscriptions");
        assertThat(TxnRuleMatcher.resolve(rules, "Gusto", "Payroll run July")).isEqualTo("Payroll");
        assertThat(TxnRuleMatcher.resolve(rules, "Corner Cafe", "lunch")).isNull();
    }

    @Test
    void matcher_equalsIsExact() {
        BusinessTxnRule r = rule("MERCHANT", "EQUALS", "Staples", "Office", 0);
        assertThat(TxnRuleMatcher.matches(r, "staples", null)).isTrue();
        assertThat(TxnRuleMatcher.matches(r, "Staples Inc", null)).isFalse();
    }

    @Test
    void applyToUncategorized_onlySetsBlankCategories() {
        when(ruleRepo.findByBusinessIdAndUserIdOrderByPositionAscIdAsc(BIZ, USER))
                .thenReturn(List.of(rule("MERCHANT", "CONTAINS", "aws", "Software & Subscriptions", 0)));
        BusinessTransaction uncategorized = txn("AWS", "cloud", null);
        BusinessTransaction alreadySet = txn("AWS", "cloud", "Manually set");
        BusinessTransaction noMatch = txn("Cafe", "lunch", null);
        when(txnRepo.findByBusinessIdAndUserIdOrderByPostedAtDescIdDesc(BIZ, USER))
                .thenReturn(List.of(uncategorized, alreadySet, noMatch));

        int updated = service.applyToUncategorized(BIZ, USER);

        assertThat(updated).isEqualTo(1);
        assertThat(uncategorized.getCategory()).isEqualTo("Software & Subscriptions");
        assertThat(alreadySet.getCategory()).isEqualTo("Manually set"); // untouched
        verify(txnRepo).save(uncategorized);
    }
}
