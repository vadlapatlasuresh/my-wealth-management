package com.mywealthmanagement.authservice.family;

import com.mywealthmanagement.authservice.household.HouseholdMember;
import com.mywealthmanagement.authservice.household.HouseholdService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Kids' cards, budgets & spending (Phase 5, backlog B3 extension).
 *
 * <p><b>Authorization is the same one rule.</b> Every method resolves the caller's household and
 * re-checks membership through {@link HouseholdService#requireActiveMember} (via
 * {@link FamilyService#requireMember}). Cards, rules, budgets and transactions are all
 * household-owned records — never a new principal, never a shared view of a personal row.
 *
 * <p><b>Linked cards never cross the boundary.</b> A LINKED card points at one of a GUARDIAN's own
 * accounts. Attaching it verifies the caller owns it ({@link AggregationClient#cardsOf}), and only
 * that owner can sync it. Sync reads the owner's OWN transactions and MATERIALIZES matches as
 * household-owned {@link FamilyTransaction} rows, so both guardians read household copies and nobody
 * reads another user's live bank feed. See V20__family_spending.sql.
 */
@Service
@RequiredArgsConstructor
public class FamilySpendingService {

    /** How far back a sync looks for new transactions. */
    private static final int SYNC_WINDOW_DAYS = 90;

    private static final List<String> BUCKETS =
            List.of(FamilyLedgerEntry.BUCKET_SPEND, FamilyLedgerEntry.BUCKET_SAVE, FamilyLedgerEntry.BUCKET_GIVE);

    private final HouseholdService households;
    private final FamilyService family;
    private final FamilyMemberRepository members;
    private final FamilyCardRepository cards;
    private final FamilyTxnRuleRepository rules;
    private final FamilyBudgetRepository budgets;
    private final FamilyTransactionRepository txns;
    private final AggregationClient aggregation;

    private Long householdOf(Long userId) {
        return households.activeMembership(userId)
                .map(HouseholdMember::getHouseholdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "Family mode lives in a household. Create or join one first."));
    }

    // ---------------------------------------------------------------- cards

    @Transactional(readOnly = true)
    public List<FamilyCard> listCards(Long userId) {
        return cards.findByHouseholdIdOrderByIdDesc(householdOf(userId));
    }

    /** The caller's OWN linkable cards from account-aggregation-service (their accounts only). */
    public List<AggregationClient.Card> linkableCards(Long userId) {
        householdOf(userId); // must be in a household to use family features
        return aggregation.cardsOf(userId);
    }

    @Transactional
    public FamilyCard addManualCard(Long userId, Long memberId, String label, String last4) {
        FamilyMember m = family.requireMember(userId, memberId);
        if (label == null || label.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A card label is required");
        }
        FamilyCard c = new FamilyCard();
        c.setHouseholdId(m.getHouseholdId());
        c.setFamilyMemberId(memberId);
        c.setLabel(label.trim());
        c.setLast4(last4 == null || last4.isBlank() ? null : last4.trim());
        c.setSourceType(FamilyCard.SOURCE_MANUAL);
        c.setCreatedByUserId(userId);
        return cards.save(c);
    }

    /**
     * Attach one of the CALLER's own linked cards to a child. Refuses unless the caller actually
     * owns that account — the whole safety story rests on this check, so it's server-side and
     * fails closed.
     */
    @Transactional
    public FamilyCard linkCard(Long userId, Long memberId, Long linkedAccountId, String label) {
        FamilyMember m = family.requireMember(userId, memberId);
        if (linkedAccountId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A card to link is required");
        }
        AggregationClient.Card owned = aggregation.cardsOf(userId).stream()
                .filter(c -> linkedAccountId.equals(c.accountId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "You can only link a card from your own connected accounts."));

        FamilyCard c = new FamilyCard();
        c.setHouseholdId(m.getHouseholdId());
        c.setFamilyMemberId(memberId);
        c.setLabel(label != null && !label.isBlank() ? label.trim()
                : (owned.name() != null ? owned.name() : "Linked card"));
        c.setLast4(owned.mask());
        c.setSourceType(FamilyCard.SOURCE_LINKED);
        c.setLinkedAccountId(linkedAccountId);
        c.setLinkedOwnerUserId(userId);
        c.setCreatedByUserId(userId);
        return cards.save(c);
    }

    @Transactional
    public void deleteCard(Long userId, Long cardId) {
        FamilyCard c = requireCard(userId, cardId);
        cards.delete(c);
    }

    private FamilyCard requireCard(Long userId, Long cardId) {
        FamilyCard c = cards.findById(cardId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Card not found"));
        households.requireActiveMember(userId, c.getHouseholdId());
        return c;
    }

    // ---------------------------------------------------------------- rules

    @Transactional(readOnly = true)
    public List<FamilyTxnRule> listRules(Long userId) {
        return rules.findByHouseholdIdOrderByIdDesc(householdOf(userId));
    }

    @Transactional
    public FamilyTxnRule addRule(Long userId, Long memberId, String matchType, Long cardId,
                                 String locationMatch, String bucket) {
        FamilyMember m = family.requireMember(userId, memberId);
        String type = matchType == null ? "" : matchType.toUpperCase();
        FamilyTxnRule r = new FamilyTxnRule();
        r.setHouseholdId(m.getHouseholdId());
        r.setFamilyMemberId(memberId);
        r.setBucket(bucket(bucket));
        r.setCreatedByUserId(userId);
        if (FamilyTxnRule.MATCH_CARD.equals(type)) {
            FamilyCard c = requireCard(userId, cardId); // card must belong to this household
            r.setMatchType(FamilyTxnRule.MATCH_CARD);
            r.setCardId(c.getId());
        } else if (FamilyTxnRule.MATCH_LOCATION.equals(type)) {
            if (locationMatch == null || locationMatch.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "A location or merchant to match is required");
            }
            r.setMatchType(FamilyTxnRule.MATCH_LOCATION);
            r.setLocationMatch(locationMatch.trim());
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rule type must be CARD or LOCATION");
        }
        return rules.save(r);
    }

    @Transactional
    public void deleteRule(Long userId, Long ruleId) {
        FamilyTxnRule r = rules.findById(ruleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Rule not found"));
        households.requireActiveMember(userId, r.getHouseholdId());
        rules.delete(r);
    }

    // ---------------------------------------------------------------- budgets

    @Transactional(readOnly = true)
    public List<FamilyBudget> listBudgets(Long userId) {
        return budgets.findByHouseholdIdOrderByIdDesc(householdOf(userId));
    }

    @Transactional
    public FamilyBudget addBudget(Long userId, Long memberId, String category, BigDecimal monthlyLimit) {
        Long householdId = householdOf(userId);
        if (memberId != null) {
            family.requireMember(userId, memberId); // a per-child budget must be a child we own
        }
        if (category == null || category.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A budget category is required");
        }
        if (monthlyLimit == null || monthlyLimit.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Monthly limit must be greater than zero");
        }
        FamilyBudget b = new FamilyBudget();
        b.setHouseholdId(householdId);
        b.setFamilyMemberId(memberId);
        b.setCategory(category.trim());
        b.setMonthlyLimit(monthlyLimit);
        b.setCreatedByUserId(userId);
        return budgets.save(b);
    }

    @Transactional
    public void deleteBudget(Long userId, Long budgetId) {
        FamilyBudget b = budgets.findById(budgetId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Budget not found"));
        households.requireActiveMember(userId, b.getHouseholdId());
        budgets.delete(b);
    }

    // ---------------------------------------------------------------- transactions

    @Transactional(readOnly = true)
    public List<FamilyTransaction> listTransactions(Long userId, Long memberId) {
        Long householdId = householdOf(userId);
        if (memberId != null) {
            family.requireMember(userId, memberId);
            return txns.findByFamilyMemberIdOrderByOccurredOnDescIdDesc(memberId);
        }
        return txns.findByHouseholdIdOrderByOccurredOnDescIdDesc(householdId);
    }

    @Transactional
    public FamilyTransaction addManualTransaction(Long userId, Long memberId, BigDecimal amount,
                                                  String merchant, String category, String location,
                                                  LocalDate occurredOn, Long cardId, String bucket) {
        FamilyMember m = family.requireMember(userId, memberId);
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount spent must be greater than zero");
        }
        if (cardId != null) {
            FamilyCard c = requireCard(userId, cardId);
            if (!c.getFamilyMemberId().equals(memberId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That card isn't this child's");
            }
        }
        FamilyTransaction t = new FamilyTransaction();
        t.setHouseholdId(m.getHouseholdId());
        t.setFamilyMemberId(memberId);
        t.setCardId(cardId);
        t.setSource(FamilyTransaction.SOURCE_MANUAL);
        t.setMerchant(merchant);
        t.setCategory(category);
        t.setLocation(location);
        t.setAmount(amount);
        t.setOccurredOn(occurredOn != null ? occurredOn : LocalDate.now());
        t.setBucket(bucket(bucket));
        t.setCreatedByUserId(userId);
        return txns.save(t);
    }

    /**
     * Pull the caller's own transactions for the linked cards THEY own, apply the household's rules,
     * and materialize new matches as household-owned rows. Idempotent: dedupes on external_id per
     * household, so re-syncing never double-counts. Returns how many new rows were written.
     */
    @Transactional
    public int sync(Long userId) {
        Long householdId = householdOf(userId);
        List<FamilyCard> linked = cards.findByHouseholdIdOrderByIdDesc(householdId).stream()
                .filter(c -> FamilyCard.SOURCE_LINKED.equals(c.getSourceType()))
                .filter(c -> userId.equals(c.getLinkedOwnerUserId())) // only the owner syncs their cards
                .toList();
        if (linked.isEmpty()) {
            return 0;
        }
        List<Long> accountIds = linked.stream().map(FamilyCard::getLinkedAccountId).toList();
        LocalDate to = LocalDate.now();
        LocalDate from = to.minusDays(SYNC_WINDOW_DAYS);
        List<AggregationClient.Txn> pulled = aggregation.transactions(userId, accountIds, from, to);

        List<FamilyTxnRule> allRules = rules.findByHouseholdIdOrderByIdDesc(householdId);
        int written = 0;
        for (AggregationClient.Txn tx : pulled) {
            if (tx.externalId() == null
                    || txns.findByHouseholdIdAndExternalId(householdId, tx.externalId()).isPresent()) {
                continue; // already materialized
            }
            FamilyCard card = linked.stream()
                    .filter(c -> tx.accountId().equals(c.getLinkedAccountId()))
                    .findFirst().orElse(null);
            if (card == null) {
                continue;
            }
            // Default: the card's own child + SPEND. A LOCATION rule that matches the merchant is a
            // specific override and wins; a CARD rule can set a non-default bucket for the card.
            Long targetMember = card.getFamilyMemberId();
            String targetBucket = FamilyLedgerEntry.BUCKET_SPEND;
            String haystack = ((tx.merchantName() != null ? tx.merchantName() : "")
                    + " " + (tx.name() != null ? tx.name() : "")).toLowerCase();
            for (FamilyTxnRule r : allRules) {
                if (FamilyTxnRule.MATCH_CARD.equals(r.getMatchType())
                        && card.getId().equals(r.getCardId())) {
                    targetBucket = r.getBucket();
                }
            }
            for (FamilyTxnRule r : allRules) {
                if (FamilyTxnRule.MATCH_LOCATION.equals(r.getMatchType())
                        && r.getLocationMatch() != null
                        && haystack.contains(r.getLocationMatch().toLowerCase())) {
                    targetMember = r.getFamilyMemberId();
                    targetBucket = r.getBucket();
                    break;
                }
            }

            FamilyTransaction t = new FamilyTransaction();
            t.setHouseholdId(householdId);
            t.setFamilyMemberId(targetMember);
            t.setCardId(card.getId());
            t.setExternalId(tx.externalId());
            t.setSource(FamilyTransaction.SOURCE_LINKED_SYNC);
            t.setMerchant(tx.merchantName() != null ? tx.merchantName() : tx.name());
            t.setCategory(tx.category());
            t.setAmount(tx.spent());
            t.setOccurredOn(tx.date());
            t.setBucket(targetBucket);
            t.setCreatedByUserId(userId);
            txns.save(t);
            written++;
        }
        return written;
    }

    // ---------------------------------------------------------------- summaries

    /**
     * Family spending for the current calendar month: per-child totals, whole-family total, a
     * category and card breakdown, and budget progress. Every figure is folded from the
     * household-owned family_transaction rows.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> spendingSummary(Long userId) {
        Long householdId = householdOf(userId);
        LocalDate today = LocalDate.now();
        LocalDate monthStart = today.withDayOfMonth(1);
        List<FamilyTransaction> month = txns.findByHouseholdIdAndOccurredOnBetween(householdId, monthStart, today);

        Map<Long, BigDecimal> byChild = new LinkedHashMap<>();
        Map<String, BigDecimal> byCategory = new LinkedHashMap<>();
        Map<Long, BigDecimal> byCard = new LinkedHashMap<>();
        BigDecimal total = BigDecimal.ZERO;
        for (FamilyTransaction t : month) {
            BigDecimal amt = t.getAmount() == null ? BigDecimal.ZERO : t.getAmount();
            total = total.add(amt);
            byChild.merge(t.getFamilyMemberId(), amt, BigDecimal::add);
            byCategory.merge(t.getCategory() == null ? "Uncategorized" : t.getCategory(), amt, BigDecimal::add);
            if (t.getCardId() != null) byCard.merge(t.getCardId(), amt, BigDecimal::add);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("month", monthStart.toString());
        out.put("total", total);
        out.put("byChild", byChild.entrySet().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("memberId", e.getKey());
            m.put("name", memberName(e.getKey()));
            m.put("spent", e.getValue());
            return m;
        }).toList());
        out.put("byCategory", byCategory.entrySet().stream().map(e -> Map.of(
                "category", (Object) e.getKey(), "spent", e.getValue())).toList());
        out.put("byCard", byCard.entrySet().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("cardId", e.getKey());
            m.put("label", cardLabel(e.getKey()));
            m.put("spent", e.getValue());
            return m;
        }).toList());
        out.put("budgets", budgetProgress(householdId, month));
        return out;
    }

    /** For each budget, how much of its monthly limit has been spent in its scope this month. */
    private List<Map<String, Object>> budgetProgress(Long householdId, List<FamilyTransaction> month) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (FamilyBudget b : budgets.findByHouseholdIdOrderByIdDesc(householdId)) {
            boolean all = isAllCategory(b.getCategory());
            BigDecimal spent = month.stream()
                    .filter(t -> b.getFamilyMemberId() == null || b.getFamilyMemberId().equals(t.getFamilyMemberId()))
                    .filter(t -> all || categoryMatches(t.getCategory(), b.getCategory()))
                    .map(t -> t.getAmount() == null ? BigDecimal.ZERO : t.getAmount())
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", b.getId());
            m.put("category", b.getCategory());
            m.put("memberId", b.getFamilyMemberId());
            m.put("memberName", b.getFamilyMemberId() == null ? "Whole family" : memberName(b.getFamilyMemberId()));
            m.put("monthlyLimit", b.getMonthlyLimit());
            m.put("spent", spent);
            out.add(m);
        }
        return out;
    }

    private static boolean isAllCategory(String category) {
        String c = category == null ? "" : category.trim().toLowerCase();
        return c.equals("all") || c.equals("*") || c.equals("everything");
    }

    private static boolean categoryMatches(String txnCategory, String budgetCategory) {
        if (txnCategory == null) return false;
        return txnCategory.toLowerCase().contains(budgetCategory.trim().toLowerCase());
    }

    private String memberName(Long memberId) {
        return members.findById(memberId).map(FamilyMember::getName).orElse("Child");
    }

    private String cardLabel(Long cardId) {
        return cards.findById(cardId).map(FamilyCard::getLabel).orElse("Card");
    }

    private static String bucket(String bucket) {
        String b = bucket == null ? FamilyLedgerEntry.BUCKET_SPEND : bucket.toUpperCase();
        if (!BUCKETS.contains(b)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bucket must be one of " + BUCKETS);
        }
        return b;
    }
}
