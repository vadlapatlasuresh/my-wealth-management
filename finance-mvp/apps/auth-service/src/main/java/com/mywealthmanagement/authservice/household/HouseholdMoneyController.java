package com.mywealthmanagement.authservice.household;

import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
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
 * Household-owned goals & bills (Phase 3b).
 *
 * <pre>
 *   GET    /api/v1/household/goals                    list (with progress + per-member split)
 *   POST   /api/v1/household/goals                    { name, targetAmount, targetDate? }
 *   DELETE /api/v1/household/goals/{id}
 *   POST   /api/v1/household/goals/{id}/contributions { amount, occurredOn?, note? }
 *
 *   GET    /api/v1/household/bills                    list (with payments + who paid)
 *   POST   /api/v1/household/bills                    { name, amount, cadence, dueDay? }
 *   DELETE /api/v1/household/bills/{id}
 *   POST   /api/v1/household/bills/{id}/payments      { amount?, paidOn? }
 * </pre>
 *
 * Served under the existing /api/v1/household/** gateway route.
 */
@RestController
@RequestMapping("/api/v1/household")
@RequiredArgsConstructor
public class HouseholdMoneyController {

    private final HouseholdMoneyService money;
    private final UserRepository userRepository;

    // ---------------------------------------------------------------- goals

    @GetMapping("/goals")
    public ResponseEntity<Map<String, Object>> listGoals() {
        Long userId = currentUserId();
        List<Map<String, Object>> out = money.listGoals(userId).stream()
                .map(g -> goalJson(userId, g)).toList();
        return ResponseEntity.ok(Map.of("goals", out));
    }

    @PostMapping("/goals")
    public ResponseEntity<Map<String, Object>> createGoal(@RequestBody Map<String, Object> body) {
        Long userId = currentUserId();
        HouseholdGoal g = money.createGoal(userId, str(body, "name"),
                money(body, "targetAmount"), date(body, "targetDate"));
        return ResponseEntity.status(HttpStatus.CREATED).body(goalJson(userId, g));
    }

    @DeleteMapping("/goals/{goalId}")
    public ResponseEntity<Void> deleteGoal(@PathVariable Long goalId) {
        money.deleteGoal(currentUserId(), goalId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/goals/{goalId}/contributions")
    public ResponseEntity<Map<String, Object>> contribute(@PathVariable Long goalId,
                                                          @RequestBody Map<String, Object> body) {
        Long userId = currentUserId();
        money.contribute(userId, goalId, money(body, "amount"), date(body, "occurredOn"), str(body, "note"));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(goalJson(userId, money.requireGoal(userId, goalId)));
    }

    // ---------------------------------------------------------------- bills

    @GetMapping("/bills")
    public ResponseEntity<Map<String, Object>> listBills() {
        Long userId = currentUserId();
        List<Map<String, Object>> out = money.listBills(userId).stream()
                .map(b -> billJson(userId, b)).toList();
        return ResponseEntity.ok(Map.of("bills", out));
    }

    @PostMapping("/bills")
    public ResponseEntity<Map<String, Object>> createBill(@RequestBody Map<String, Object> body) {
        Long userId = currentUserId();
        HouseholdBill b = money.createBill(userId, str(body, "name"), money(body, "amount"),
                str(body, "cadence"), intOrNull(body, "dueDay"));
        return ResponseEntity.status(HttpStatus.CREATED).body(billJson(userId, b));
    }

    @DeleteMapping("/bills/{billId}")
    public ResponseEntity<Void> deleteBill(@PathVariable Long billId) {
        money.deleteBill(currentUserId(), billId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/bills/{billId}/payments")
    public ResponseEntity<Map<String, Object>> payBill(@PathVariable Long billId,
                                                       @RequestBody(required = false) Map<String, Object> body) {
        Long userId = currentUserId();
        money.payBill(userId, billId, money(body, "amount"), date(body, "paidOn"));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(billJson(userId, money.requireBill(userId, billId)));
    }

    // ---------------------------------------------------------------- shaping

    /** Goal + total saved + who contributed how much (the "who paid what" split). */
    private Map<String, Object> goalJson(Long userId, HouseholdGoal g) {
        List<HouseholdGoalContribution> cs = money.contributionsFor(userId, g.getId());
        BigDecimal saved = cs.stream().map(HouseholdGoalContribution::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<Long, BigDecimal> byMember = new LinkedHashMap<>();
        for (HouseholdGoalContribution c : cs) {
            byMember.merge(c.getUserId(), c.getAmount(), BigDecimal::add);
        }
        List<Map<String, Object>> split = byMember.entrySet().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", e.getKey());
            m.put("name", displayName(e.getKey()));
            m.put("amount", e.getValue());
            return m;
        }).toList();

        Map<String, Object> j = new LinkedHashMap<>();
        j.put("id", g.getId());
        j.put("name", g.getName());
        j.put("targetAmount", g.getTargetAmount());
        j.put("targetDate", g.getTargetDate());
        j.put("saved", saved);
        j.put("contributors", split);
        return j;
    }

    /** Bill + its payments, each attributed to the member who actually paid. */
    private Map<String, Object> billJson(Long userId, HouseholdBill b) {
        List<Map<String, Object>> pays = money.paymentsFor(userId, b.getId()).stream().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("paidByUserId", p.getPaidByUserId());
            m.put("paidByName", displayName(p.getPaidByUserId()));
            m.put("amount", p.getAmount());
            m.put("paidOn", p.getPaidOn());
            return m;
        }).toList();

        Map<String, Object> j = new LinkedHashMap<>();
        j.put("id", b.getId());
        j.put("name", b.getName());
        j.put("amount", b.getAmount());
        j.put("cadence", b.getCadence());
        j.put("dueDay", b.getDueDay());
        j.put("payments", pays);
        return j;
    }

    private String displayName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("Member");
    }

    // ---------------------------------------------------------------- parsing

    private static String str(Map<String, Object> body, String key) {
        if (body == null) return null;
        Object v = body.get(key);
        return v != null ? v.toString() : null;
    }

    private static BigDecimal money(Map<String, Object> body, String key) {
        String raw = str(body, key);
        if (raw == null || raw.isBlank()) return null;
        try {
            return new BigDecimal(raw);
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'" + key + "' must be a number");
        }
    }

    private static Integer intOrNull(Map<String, Object> body, String key) {
        String raw = str(body, key);
        if (raw == null || raw.isBlank()) return null;
        try {
            return Integer.valueOf(raw);
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'" + key + "' must be a whole number");
        }
    }

    private static LocalDate date(Map<String, Object> body, String key) {
        String raw = str(body, key);
        if (raw == null || raw.isBlank()) return null;
        try {
            return LocalDate.parse(raw);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "'" + key + "' must be an ISO date (YYYY-MM-DD)");
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
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid identity");
        }
    }
}
