package com.mywealthmanagement.businessfinancialsservice.ledger;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The double-entry general ledger (GL.1). Enforces the accounting invariants:
 * every posted entry balances (Σ debits = Σ credits), lines reference real accounts, and the
 * ledger is append-only — corrections are posted as REVERSAL entries, never edits/deletes.
 */
@Service
@RequiredArgsConstructor
public class LedgerService {

    private final LedgerAccountRepository accountRepo;
    private final JournalEntryRepository entryRepo;
    private final JournalLineRepository lineRepo;

    /** One line of a posting request: a debit OR a credit against an account code. */
    public record LineInput(String accountCode, BigDecimal debit, BigDecimal credit, String memo) {}

    /* ---------------- Chart of accounts ---------------- */

    /** Seeds the default chart of accounts for a business the first time it's used. */
    @Transactional
    public List<LedgerAccount> ensureAccounts(Long businessId, Long userId) {
        if (!accountRepo.existsByBusinessId(businessId)) {
            List<LedgerAccount> seeded = new ArrayList<>();
            for (ChartOfAccounts.Seed s : ChartOfAccounts.DEFAULTS) {
                LedgerAccount a = new LedgerAccount();
                a.setUserId(userId);
                a.setBusinessId(businessId);
                a.setCode(s.code());
                a.setName(s.name());
                a.setType(s.type());
                a.setNormalBalance(ChartOfAccounts.normalBalance(s.type()));
                seeded.add(a);
            }
            accountRepo.saveAll(seeded);
        }
        return accountRepo.findByBusinessIdAndUserIdOrderByCodeAsc(businessId, userId);
    }

    @Transactional
    public LedgerAccount addAccount(Long businessId, Long userId, String code, String name, String type) {
        if (code == null || code.isBlank()) throw badRequest("Account code is required");
        if (name == null || name.isBlank()) throw badRequest("Account name is required");
        if (!ChartOfAccounts.isValidType(type)) throw badRequest("type must be ASSET, LIABILITY, EQUITY, INCOME or EXPENSE");
        accountRepo.findByBusinessIdAndCode(businessId, code.trim())
                .ifPresent(a -> { throw new ResponseStatusException(HttpStatus.CONFLICT, "Account code already exists"); });
        LedgerAccount a = new LedgerAccount();
        a.setUserId(userId);
        a.setBusinessId(businessId);
        a.setCode(code.trim());
        a.setName(name.trim());
        a.setType(type.toUpperCase());
        a.setNormalBalance(ChartOfAccounts.normalBalance(type));
        return accountRepo.save(a);
    }

    /* ---------------- Posting ---------------- */

    /**
     * Posts a balanced journal entry. Validates that every line references an account in this
     * business, each line is a single positive debit or credit, and Σ debits = Σ credits &gt; 0.
     */
    @Transactional
    public JournalEntry post(Long businessId, Long userId, LocalDate date, String memo,
                             String sourceType, String sourceRef, List<LineInput> lines) {
        ensureAccounts(businessId, userId); // a business always has its chart before posting
        if (lines == null || lines.size() < 2) throw badRequest("A journal entry needs at least two lines");

        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;
        List<JournalLine> built = new ArrayList<>();
        int pos = 0;
        for (LineInput li : lines) {
            LedgerAccount acct = accountRepo.findByBusinessIdAndCode(businessId, li.accountCode() == null ? "" : li.accountCode().trim())
                    .orElseThrow(() -> badRequest("Unknown account code: " + li.accountCode()));
            BigDecimal debit = scale(li.debit());
            BigDecimal credit = scale(li.credit());
            if (debit.signum() < 0 || credit.signum() < 0) throw badRequest("Amounts can't be negative");
            if (debit.signum() > 0 && credit.signum() > 0) throw badRequest("A line is either a debit or a credit, not both");
            if (debit.signum() == 0 && credit.signum() == 0) continue; // skip zero lines
            JournalLine l = new JournalLine();
            l.setAccountId(acct.getId());
            l.setDebit(debit);
            l.setCredit(credit);
            l.setMemo(li.memo());
            l.setPosition(pos++);
            built.add(l);
            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);
        }
        if (built.size() < 2) throw badRequest("A journal entry needs at least two non-zero lines");
        if (totalDebit.signum() == 0) throw badRequest("A journal entry can't be for zero");
        if (totalDebit.compareTo(totalCredit) != 0) {
            throw badRequest("Entry does not balance: debits " + totalDebit + " ≠ credits " + totalCredit);
        }

        JournalEntry e = new JournalEntry();
        e.setUserId(userId);
        e.setBusinessId(businessId);
        e.setEntryDate(date != null ? date : LocalDate.now());
        e.setMemo(memo);
        e.setSourceType(sourceType == null || sourceType.isBlank() ? "MANUAL" : sourceType.toUpperCase());
        e.setSourceRef(sourceRef);
        JournalEntry saved = entryRepo.save(e);
        for (JournalLine l : built) l.setEntryId(saved.getId());
        saved.setLines(lineRepo.saveAll(built));
        return saved;
    }

    /**
     * Posts a REVERSAL of an existing entry (debits and credits swapped), leaving the original
     * intact — the append-only way to undo. Refuses to reverse an entry twice.
     */
    @Transactional
    public JournalEntry reverse(Long businessId, Long userId, Long entryId, LocalDate date, String memo) {
        JournalEntry original = entryRepo.findByIdAndBusinessIdAndUserId(entryId, businessId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Entry not found"));
        if (entryRepo.existsByBusinessIdAndReversalOf(businessId, entryId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This entry has already been reversed");
        }
        List<JournalLine> originalLines = lineRepo.findByEntryIdOrderByPositionAsc(entryId);

        JournalEntry rev = new JournalEntry();
        rev.setUserId(userId);
        rev.setBusinessId(businessId);
        rev.setEntryDate(date != null ? date : LocalDate.now());
        rev.setMemo(memo != null ? memo : "Reversal of entry #" + entryId + (original.getMemo() != null ? " — " + original.getMemo() : ""));
        rev.setSourceType("REVERSAL");
        rev.setSourceRef(String.valueOf(entryId));
        rev.setReversalOf(entryId);
        JournalEntry saved = entryRepo.save(rev);

        List<JournalLine> swapped = new ArrayList<>();
        int pos = 0;
        for (JournalLine ol : originalLines) {
            JournalLine l = new JournalLine();
            l.setEntryId(saved.getId());
            l.setAccountId(ol.getAccountId());
            l.setDebit(ol.getCredit());   // swap
            l.setCredit(ol.getDebit());
            l.setMemo(ol.getMemo());
            l.setPosition(pos++);
            swapped.add(l);
        }
        saved.setLines(lineRepo.saveAll(swapped));
        return saved;
    }

    /* ---------------- Reads ---------------- */

    @Transactional(readOnly = true)
    public List<JournalEntry> listEntries(Long businessId, Long userId) {
        List<JournalEntry> entries = entryRepo.findByBusinessIdAndUserIdOrderByEntryDateDescIdDesc(businessId, userId);
        if (entries.isEmpty()) return entries;
        Map<Long, LedgerAccount> byId = new HashMap<>();
        accountRepo.findByBusinessIdAndUserIdOrderByCodeAsc(businessId, userId).forEach(a -> byId.put(a.getId(), a));
        Map<Long, List<JournalLine>> byEntry = new HashMap<>();
        for (JournalLine l : lineRepo.findByEntryIdInOrderByPositionAsc(entries.stream().map(JournalEntry::getId).toList())) {
            LedgerAccount a = byId.get(l.getAccountId());
            if (a != null) { l.setAccountCode(a.getCode()); l.setAccountName(a.getName()); }
            byEntry.computeIfAbsent(l.getEntryId(), k -> new ArrayList<>()).add(l);
        }
        for (JournalEntry e : entries) e.setLines(byEntry.getOrDefault(e.getId(), List.of()));
        return entries;
    }

    /**
     * Trial balance: every account with a non-zero balance, shown in its natural debit or
     * credit column, plus totals (which must be equal for a consistent ledger).
     */
    @Transactional(readOnly = true)
    public Map<String, Object> trialBalance(Long businessId, Long userId) {
        ensureAccounts(businessId, userId);
        Map<Long, BigDecimal[]> sums = new HashMap<>(); // accountId -> [debit, credit]
        for (Object[] row : lineRepo.sumByAccount(businessId, userId)) {
            sums.put(((Number) row[0]).longValue(), new BigDecimal[]{ (BigDecimal) row[1], (BigDecimal) row[2] });
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;
        for (LedgerAccount a : accountRepo.findByBusinessIdAndUserIdOrderByCodeAsc(businessId, userId)) {
            BigDecimal[] dc = sums.getOrDefault(a.getId(), new BigDecimal[]{ BigDecimal.ZERO, BigDecimal.ZERO });
            BigDecimal net = dc[0].subtract(dc[1]); // debit-positive
            if (net.signum() == 0) continue;
            Map<String, Object> r = new java.util.LinkedHashMap<>();
            r.put("code", a.getCode());
            r.put("name", a.getName());
            r.put("type", a.getType());
            if (net.signum() > 0) { r.put("debit", net); r.put("credit", BigDecimal.ZERO); totalDebit = totalDebit.add(net); }
            else { r.put("debit", BigDecimal.ZERO); r.put("credit", net.negate()); totalCredit = totalCredit.add(net.negate()); }
            rows.add(r);
        }
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("rows", rows);
        out.put("totalDebit", totalDebit);
        out.put("totalCredit", totalCredit);
        out.put("balanced", totalDebit.compareTo(totalCredit) == 0);
        return out;
    }

    private static BigDecimal scale(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).setScale(2, RoundingMode.HALF_UP);
    }

    private static ResponseStatusException badRequest(String msg) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }
}
