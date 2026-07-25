package com.mywealthmanagement.authservice.family;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Kids' cards, budgets & spending (Phase 5, backlog B3 extension).
 *
 * <pre>
 *   GET    /api/v1/household/family/cards                       list cards
 *   GET    /api/v1/household/family/cards/linkable              the caller's own linkable accounts
 *   POST   /api/v1/household/family/members/{id}/cards          add a manual card { label, last4? }
 *   POST   /api/v1/household/family/members/{id}/cards/link     link one of the caller's cards { linkedAccountId, label? }
 *   DELETE /api/v1/household/family/cards/{cardId}
 *
 *   GET    /api/v1/household/family/rules
 *   POST   /api/v1/household/family/members/{id}/rules          { matchType: CARD|LOCATION, cardId?, locationMatch?, bucket? }
 *   DELETE /api/v1/household/family/rules/{ruleId}
 *
 *   GET    /api/v1/household/family/budgets
 *   POST   /api/v1/household/family/budgets                     { memberId?, category, monthlyLimit }
 *   DELETE /api/v1/household/family/budgets/{budgetId}
 *
 *   GET    /api/v1/household/family/transactions?memberId=
 *   POST   /api/v1/household/family/members/{id}/transactions   manual { amount, merchant?, category?, location?, occurredOn?, cardId?, bucket? }
 *   POST   /api/v1/household/family/sync                        pull the caller's linked-card spend
 *   GET    /api/v1/household/family/spending                    this month's family spend + budgets
 * </pre>
 *
 * Served under the existing /api/v1/household/** gateway route — no RouteLocator change needed.
 */
@RestController
@RequestMapping("/api/v1/household/family")
@RequiredArgsConstructor
public class FamilySpendingController {

    private final FamilySpendingService spending;

    // ---------------------------------------------------------------- cards

    @GetMapping("/cards")
    public ResponseEntity<Map<String, Object>> listCards() {
        List<Map<String, Object>> out = spending.listCards(currentUserId()).stream()
                .map(FamilySpendingController::cardJson).toList();
        return ResponseEntity.ok(Map.of("cards", out));
    }

    @GetMapping("/cards/linkable")
    public ResponseEntity<Map<String, Object>> linkableCards() {
        List<Map<String, Object>> out = spending.linkableCards(currentUserId()).stream()
                .map(c -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("accountId", c.accountId());
                    m.put("name", c.name());
                    m.put("mask", c.mask());
                    m.put("type", c.type());
                    m.put("subtype", c.subtype());
                    return m;
                }).toList();
        return ResponseEntity.ok(Map.of("cards", out));
    }

    @PostMapping("/members/{memberId}/cards")
    public ResponseEntity<Map<String, Object>> addManualCard(@PathVariable Long memberId,
                                                             @RequestBody Map<String, Object> body) {
        FamilyCard c = spending.addManualCard(currentUserId(), memberId, str(body, "label"), str(body, "last4"));
        return ResponseEntity.status(HttpStatus.CREATED).body(cardJson(c));
    }

    @PostMapping("/members/{memberId}/cards/link")
    public ResponseEntity<Map<String, Object>> linkCard(@PathVariable Long memberId,
                                                        @RequestBody Map<String, Object> body) {
        FamilyCard c = spending.linkCard(currentUserId(), memberId, longVal(body, "linkedAccountId"), str(body, "label"));
        return ResponseEntity.status(HttpStatus.CREATED).body(cardJson(c));
    }

    @DeleteMapping("/cards/{cardId}")
    public ResponseEntity<Void> deleteCard(@PathVariable Long cardId) {
        spending.deleteCard(currentUserId(), cardId);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------------------------------------------- rules

    @GetMapping("/rules")
    public ResponseEntity<Map<String, Object>> listRules() {
        List<Map<String, Object>> out = spending.listRules(currentUserId()).stream()
                .map(FamilySpendingController::ruleJson).toList();
        return ResponseEntity.ok(Map.of("rules", out));
    }

    @PostMapping("/members/{memberId}/rules")
    public ResponseEntity<Map<String, Object>> addRule(@PathVariable Long memberId,
                                                       @RequestBody Map<String, Object> body) {
        FamilyTxnRule r = spending.addRule(currentUserId(), memberId, str(body, "matchType"),
                longVal(body, "cardId"), str(body, "locationMatch"), str(body, "bucket"));
        return ResponseEntity.status(HttpStatus.CREATED).body(ruleJson(r));
    }

    @DeleteMapping("/rules/{ruleId}")
    public ResponseEntity<Void> deleteRule(@PathVariable Long ruleId) {
        spending.deleteRule(currentUserId(), ruleId);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------------------------------------------- budgets

    @GetMapping("/budgets")
    public ResponseEntity<Map<String, Object>> listBudgets() {
        List<Map<String, Object>> out = spending.listBudgets(currentUserId()).stream()
                .map(FamilySpendingController::budgetJson).toList();
        return ResponseEntity.ok(Map.of("budgets", out));
    }

    @PostMapping("/budgets")
    public ResponseEntity<Map<String, Object>> addBudget(@RequestBody Map<String, Object> body) {
        FamilyBudget b = spending.addBudget(currentUserId(), longVal(body, "memberId"),
                str(body, "category"), money(body, "monthlyLimit"));
        return ResponseEntity.status(HttpStatus.CREATED).body(budgetJson(b));
    }

    @DeleteMapping("/budgets/{budgetId}")
    public ResponseEntity<Void> deleteBudget(@PathVariable Long budgetId) {
        spending.deleteBudget(currentUserId(), budgetId);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------------------------------------------- transactions & sync

    @GetMapping("/transactions")
    public ResponseEntity<Map<String, Object>> listTransactions(@RequestParam(value = "memberId", required = false) Long memberId) {
        List<Map<String, Object>> out = spending.listTransactions(currentUserId(), memberId).stream()
                .map(FamilySpendingController::txnJson).toList();
        return ResponseEntity.ok(Map.of("transactions", out));
    }

    @PostMapping("/members/{memberId}/transactions")
    public ResponseEntity<Map<String, Object>> addTransaction(@PathVariable Long memberId,
                                                              @RequestBody Map<String, Object> body) {
        FamilyTransaction t = spending.addManualTransaction(currentUserId(), memberId, money(body, "amount"),
                str(body, "merchant"), str(body, "category"), str(body, "location"),
                date(body, "occurredOn"), longVal(body, "cardId"), str(body, "bucket"));
        return ResponseEntity.status(HttpStatus.CREATED).body(txnJson(t));
    }

    @PostMapping("/sync")
    public ResponseEntity<Map<String, Object>> sync() {
        int n = spending.sync(currentUserId());
        return ResponseEntity.ok(Map.of("synced", n));
    }

    @GetMapping("/spending")
    public ResponseEntity<Map<String, Object>> spending() {
        return ResponseEntity.ok(spending.spendingSummary(currentUserId()));
    }

    // ---------------------------------------------------------------- json

    private static Map<String, Object> cardJson(FamilyCard c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("familyMemberId", c.getFamilyMemberId());
        m.put("label", c.getLabel());
        m.put("last4", c.getLast4());
        m.put("sourceType", c.getSourceType());
        m.put("linkedAccountId", c.getLinkedAccountId());
        return m;
    }

    private static Map<String, Object> ruleJson(FamilyTxnRule r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("familyMemberId", r.getFamilyMemberId());
        m.put("matchType", r.getMatchType());
        m.put("cardId", r.getCardId());
        m.put("locationMatch", r.getLocationMatch());
        m.put("bucket", r.getBucket());
        return m;
    }

    private static Map<String, Object> budgetJson(FamilyBudget b) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", b.getId());
        m.put("familyMemberId", b.getFamilyMemberId());
        m.put("category", b.getCategory());
        m.put("monthlyLimit", b.getMonthlyLimit());
        return m;
    }

    private static Map<String, Object> txnJson(FamilyTransaction t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", t.getId());
        m.put("familyMemberId", t.getFamilyMemberId());
        m.put("cardId", t.getCardId());
        m.put("source", t.getSource());
        m.put("merchant", t.getMerchant());
        m.put("category", t.getCategory());
        m.put("amount", t.getAmount());
        m.put("location", t.getLocation());
        m.put("occurredOn", t.getOccurredOn());
        m.put("bucket", t.getBucket());
        return m;
    }

    // ---------------------------------------------------------------- parsing

    private static String str(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        return v == null ? null : String.valueOf(v);
    }

    private static Long longVal(Map<String, Object> body, String key) {
        String raw = str(body, key);
        if (raw == null || raw.isBlank()) return null;
        try {
            return Long.valueOf(raw.trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " must be a whole number");
        }
    }

    private static BigDecimal money(Map<String, Object> body, String key) {
        String raw = str(body, key);
        if (raw == null || raw.isBlank()) return null;
        try {
            return new BigDecimal(raw.trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " must be an amount");
        }
    }

    private static LocalDate date(Map<String, Object> body, String key) {
        String raw = str(body, key);
        if (raw == null || raw.isBlank()) return null;
        try {
            return LocalDate.parse(raw.trim());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " must be a date (YYYY-MM-DD)");
        }
    }

    private Long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        try {
            return Long.valueOf(auth.getName());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Invalid session. Please sign out and sign in again.");
        }
    }
}
