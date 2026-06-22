package com.mywealthmanagement.accountaggregationservice.transaction;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Manage a user's auto-categorization rules and apply them to their transactions. */
@Service
@RequiredArgsConstructor
public class CategoryRuleService {

    private static final Set<String> MATCH_TYPES = Set.of("CONTAINS", "EQUALS", "STARTS_WITH");

    private final CategoryRuleRepository ruleRepository;
    private final TransactionRepository transactionRepository;

    public List<CategoryRule> list(Long userId) {
        return ruleRepository.findByUserIdOrderByCreatedAtAsc(userId);
    }

    public CategoryRule create(Long userId, String matchType, String pattern, String category) {
        String mt = matchType == null ? "CONTAINS" : matchType.trim().toUpperCase(Locale.ROOT);
        if (!MATCH_TYPES.contains(mt)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "matchType must be CONTAINS, EQUALS, or STARTS_WITH");
        }
        if (pattern == null || pattern.isBlank() || category == null || category.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "pattern and category are required");
        }
        CategoryRule r = new CategoryRule();
        r.setUserId(userId);
        r.setMatchType(mt);
        r.setPattern(pattern.trim());
        r.setCategory(category.trim());
        return ruleRepository.save(r);
    }

    @Transactional
    public void delete(Long userId, Long id) {
        CategoryRule r = ruleRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Rule not found"));
        ruleRepository.delete(r);
    }

    /**
     * Apply the user's rules to their UNcategorized transactions, persisting the matched
     * category. Manually-set categories are never overwritten. Returns how many changed.
     */
    @Transactional
    public int applyRules(Long userId) {
        List<CategoryRule> rules = list(userId);
        if (rules.isEmpty()) return 0;
        int changed = 0;
        for (Transaction t : transactionRepository.findByUserId(userId)) {
            if (t.getCategory() != null && !t.getCategory().isBlank()) continue; // keep manual/existing
            String cat = CategoryRuleMatcher.categoryFor(t.getName(), rules);
            if (cat != null) {
                t.setCategory(cat);
                transactionRepository.save(t);
                changed++;
            }
        }
        return changed;
    }
}
