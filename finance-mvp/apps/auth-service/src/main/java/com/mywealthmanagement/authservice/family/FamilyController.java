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
 * Family / kids mode (Phase 5, backlog B3).
 *
 * <pre>
 *   GET    /api/v1/household/family                              guardian view: members + balances
 *   POST   /api/v1/household/family/members                      { name, birthYear?, allowanceAmount?,
 *                                                                  allowanceCadence?, allowanceDay?,
 *                                                                  splitSpendPct?, splitSavePct?, splitGivePct? }
 *   PUT    /api/v1/household/family/members/{id}                 same body
 *   DELETE /api/v1/household/family/members/{id}                 archive (ledger is preserved)
 *
 *   GET    /api/v1/household/family/members/{id}/ledger          entries + bucket balances
 *   POST   /api/v1/household/family/members/{id}/ledger          { type: "ALLOWANCE" } pays the split,
 *                                                                otherwise { type, bucket, amount, occurredOn?, note? }
 *
 *   GET    /api/v1/household/family/members/{id}/chores
 *   POST   /api/v1/household/family/members/{id}/chores          { title, rewardAmount? }
 *   POST   /api/v1/household/family/members/{id}/chores/{cid}/complete
 * </pre>
 *
 * Served under the existing /api/v1/household/** gateway route — no RouteLocator change needed.
 */
@RestController
@RequestMapping("/api/v1/household/family")
@RequiredArgsConstructor
public class FamilyController {

    private final FamilyService family;

    // ---------------------------------------------------------------- members

    @GetMapping
    public ResponseEntity<Map<String, Object>> list() {
        Long userId = currentUserId();
        List<Map<String, Object>> out = family.listMembers(userId).stream()
                .map(m -> memberJson(userId, m))
                .toList();
        return ResponseEntity.ok(Map.of("members", out));
    }

    @PostMapping("/members")
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        Long userId = currentUserId();
        FamilyMember m = family.addMember(userId, str(body, "name"), integer(body, "birthYear"),
                money(body, "allowanceAmount"), str(body, "allowanceCadence"), integer(body, "allowanceDay"),
                integer(body, "splitSpendPct"), integer(body, "splitSavePct"), integer(body, "splitGivePct"));
        return ResponseEntity.status(HttpStatus.CREATED).body(memberJson(userId, m));
    }

    @PutMapping("/members/{memberId}")
    public ResponseEntity<Map<String, Object>> update(@PathVariable Long memberId,
                                                      @RequestBody Map<String, Object> body) {
        Long userId = currentUserId();
        FamilyMember m = family.updateMember(userId, memberId, str(body, "name"), integer(body, "birthYear"),
                money(body, "allowanceAmount"), str(body, "allowanceCadence"), integer(body, "allowanceDay"),
                integer(body, "splitSpendPct"), integer(body, "splitSavePct"), integer(body, "splitGivePct"));
        return ResponseEntity.ok(memberJson(userId, m));
    }

    @DeleteMapping("/members/{memberId}")
    public ResponseEntity<Void> archive(@PathVariable Long memberId) {
        family.archiveMember(currentUserId(), memberId);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------------------------------------------- ledger

    @GetMapping("/members/{memberId}/ledger")
    public ResponseEntity<Map<String, Object>> ledger(@PathVariable Long memberId) {
        Long userId = currentUserId();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("balances", family.balances(userId, memberId));
        out.put("entries", family.ledgerFor(userId, memberId).stream().map(FamilyController::entryJson).toList());
        return ResponseEntity.ok(out);
    }

    @PostMapping("/members/{memberId}/ledger")
    public ResponseEntity<Map<String, Object>> addEntry(@PathVariable Long memberId,
                                                        @RequestBody Map<String, Object> body) {
        Long userId = currentUserId();
        String type = str(body, "type");
        if (type == null || FamilyLedgerEntry.TYPE_ALLOWANCE.equalsIgnoreCase(type)) {
            family.payAllowance(userId, memberId, money(body, "amount"), date(body, "occurredOn"), str(body, "note"));
        } else {
            family.addEntry(userId, memberId, type, str(body, "bucket"), money(body, "amount"),
                    date(body, "occurredOn"), str(body, "note"));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(ledger(memberId).getBody());
    }

    // ---------------------------------------------------------------- chores

    @GetMapping("/members/{memberId}/chores")
    public ResponseEntity<Map<String, Object>> chores(@PathVariable Long memberId) {
        List<Map<String, Object>> out = family.choresFor(currentUserId(), memberId).stream()
                .map(FamilyController::choreJson).toList();
        return ResponseEntity.ok(Map.of("chores", out));
    }

    @PostMapping("/members/{memberId}/chores")
    public ResponseEntity<Map<String, Object>> addChore(@PathVariable Long memberId,
                                                        @RequestBody Map<String, Object> body) {
        FamilyChore c = family.addChore(currentUserId(), memberId, str(body, "title"), money(body, "rewardAmount"));
        return ResponseEntity.status(HttpStatus.CREATED).body(choreJson(c));
    }

    @PostMapping("/members/{memberId}/chores/{choreId}/complete")
    public ResponseEntity<Map<String, Object>> completeChore(@PathVariable Long memberId,
                                                             @PathVariable Long choreId) {
        return ResponseEntity.ok(choreJson(family.completeChore(currentUserId(), memberId, choreId)));
    }

    // ---------------------------------------------------------------- json

    private Map<String, Object> memberJson(Long userId, FamilyMember m) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", m.getId());
        out.put("name", m.getName());
        out.put("birthYear", m.getBirthYear());
        out.put("allowanceAmount", m.getAllowanceAmount());
        out.put("allowanceCadence", m.getAllowanceCadence());
        out.put("allowanceDay", m.getAllowanceDay());
        out.put("split", Map.of(
                "spend", m.getSplitSpendPct(),
                "save", m.getSplitSavePct(),
                "give", m.getSplitGivePct()));
        out.put("balances", family.balances(userId, m.getId()));
        out.put("openChores", family.choresFor(userId, m.getId()).stream()
                .filter(c -> c.getCompletedAt() == null).count());
        return out;
    }

    private static Map<String, Object> entryJson(FamilyLedgerEntry e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", e.getId());
        out.put("type", e.getEntryType());
        out.put("bucket", e.getBucket());
        out.put("amount", e.getAmount());
        out.put("occurredOn", e.getOccurredOn());
        out.put("note", e.getNote());
        return out;
    }

    private static Map<String, Object> choreJson(FamilyChore c) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", c.getId());
        out.put("title", c.getTitle());
        out.put("rewardAmount", c.getRewardAmount());
        out.put("completedAt", c.getCompletedAt());
        return out;
    }

    // ---------------------------------------------------------------- helpers

    private static String str(Map<String, Object> body, String key) {
        Object v = body.get(key);
        return v == null ? null : String.valueOf(v);
    }

    private static Integer integer(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null) return null;
        try {
            return Integer.valueOf(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " must be a whole number");
        }
    }

    private static BigDecimal money(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null || String.valueOf(v).isBlank()) return null;
        try {
            return new BigDecimal(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " must be an amount");
        }
    }

    private static LocalDate date(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null || String.valueOf(v).isBlank()) return null;
        try {
            return LocalDate.parse(String.valueOf(v).trim());
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
