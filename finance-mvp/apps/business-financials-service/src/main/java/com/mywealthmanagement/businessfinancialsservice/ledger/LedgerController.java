package com.mywealthmanagement.businessfinancialsservice.ledger;

import com.mywealthmanagement.businessfinancialsservice.business.manual.ManualBusinessRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The general-ledger API (GL.1) — chart of accounts, journal-entry posting/reversal, and the
 * trial balance. Mounted under the already-routed {@code /api/v1/business} prefix so it needs
 * no new gateway route. Owner-scoped by the JWT subject.
 */
@RestController
@RequestMapping("/api/v1/business/ledger")
@RequiredArgsConstructor
public class LedgerController {

    private final LedgerService ledger;
    private final LedgerStatementsService statements;
    private final ManualBusinessRepository businessRepo;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    private void assertOwned(Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
    }

    @GetMapping("/{businessId}/accounts")
    public List<LedgerAccount> accounts(@PathVariable Long businessId) {
        assertOwned(businessId);
        return ledger.ensureAccounts(businessId, userId());
    }

    @PostMapping("/{businessId}/accounts")
    public LedgerAccount addAccount(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        assertOwned(businessId);
        return ledger.addAccount(businessId, userId(), str(body.get("code")), str(body.get("name")), str(body.get("type")));
    }

    @GetMapping("/{businessId}/entries")
    public List<JournalEntry> entries(@PathVariable Long businessId) {
        assertOwned(businessId);
        return ledger.listEntries(businessId, userId());
    }

    @PostMapping("/{businessId}/entries")
    public JournalEntry post(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        assertOwned(businessId);
        List<LedgerService.LineInput> lines = new ArrayList<>();
        if (body.get("lines") instanceof List<?> raw) {
            for (Object o : raw) {
                if (o instanceof Map<?, ?> m) {
                    lines.add(new LedgerService.LineInput(
                            str(m.get("accountCode")), money(m.get("debit")), money(m.get("credit")), str(m.get("memo"))));
                }
            }
        }
        return ledger.post(businessId, userId(), date(body.get("entryDate")), str(body.get("memo")),
                str(body.get("sourceType")), str(body.get("sourceRef")), lines);
    }

    @PostMapping("/{businessId}/entries/{id}/reverse")
    public JournalEntry reverse(@PathVariable Long businessId, @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        assertOwned(businessId);
        Map<String, Object> b = body == null ? Map.of() : body;
        return ledger.reverse(businessId, userId(), id, date(b.get("entryDate")), str(b.get("memo")));
    }

    @GetMapping("/{businessId}/trial-balance")
    public Map<String, Object> trialBalance(@PathVariable Long businessId) {
        assertOwned(businessId);
        return ledger.trialBalance(businessId, userId());
    }

    /* ---------------- Financial statements (GL.3) ---------------- */

    @GetMapping("/{businessId}/statements/pnl")
    public Map<String, Object> pnl(@PathVariable Long businessId,
                                   @RequestParam(required = false) String from,
                                   @RequestParam(required = false) String to) {
        assertOwned(businessId);
        LocalDate[] range = range(from, to);
        return statements.profitAndLoss(businessId, userId(), range[0], range[1]);
    }

    @GetMapping("/{businessId}/statements/balance-sheet")
    public Map<String, Object> balanceSheet(@PathVariable Long businessId,
                                            @RequestParam(required = false) String asOf) {
        assertOwned(businessId);
        LocalDate d = date(asOf);
        return statements.balanceSheet(businessId, userId(), d != null ? d : LocalDate.now());
    }

    @GetMapping("/{businessId}/statements/cash-flow")
    public Map<String, Object> cashFlow(@PathVariable Long businessId,
                                        @RequestParam(required = false) String from,
                                        @RequestParam(required = false) String to) {
        assertOwned(businessId);
        LocalDate[] range = range(from, to);
        return statements.cashFlow(businessId, userId(), range[0], range[1]);
    }

    /** Defaults an unspecified range to the current year-to-date. */
    private LocalDate[] range(String from, String to) {
        LocalDate t = date(to);
        LocalDate f = date(from);
        if (t == null) t = LocalDate.now();
        if (f == null) f = t.withDayOfYear(1);
        return new LocalDate[]{ f, t };
    }

    /* ---- small parse helpers (mirror ManualBusinessController) ---- */

    private String str(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private BigDecimal money(Object o) {
        if (o == null) return null;
        try { return new BigDecimal(o.toString().replace(",", "").trim()); }
        catch (NumberFormatException e) { return null; }
    }

    private LocalDate date(Object o) {
        String s = str(o);
        if (s == null) return null;
        try { return LocalDate.parse(s); } catch (RuntimeException e) { return null; }
    }
}
