package com.mywealthmanagement.authservice.family;

import com.mywealthmanagement.authservice.household.EntitlementsClient;
import com.mywealthmanagement.authservice.household.HouseholdMember;
import com.mywealthmanagement.authservice.household.HouseholdService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Family / kids mode (Phase 5, backlog B3): allowance, spend/save/give buckets, and chores.
 *
 * <p><b>Authorization.</b> Every method resolves the caller's household and then re-checks
 * membership of the specific record's household via {@link HouseholdService#requireActiveMember}.
 * There is exactly one rule, in one place. Children are household-owned records rather than user
 * accounts, so nothing here reinterprets an existing {@code user_id}-scoped query — see
 * V18__family_mode.sql.
 *
 * <p><b>Balances are derived, never stored.</b> Every figure this class returns is a fold over
 * the append-only ledger. A cached balance and a ledger drift apart eventually, and this is a
 * feature where a parent and a child compare notes out loud.
 */
@Service
@RequiredArgsConstructor
public class FamilyService {

    /** Creating a family profile is the paid action; everything after it is free to use. */
    public static final String FEATURE_KEY = "individual.family";

    private static final List<String> CADENCES =
            List.of(FamilyMember.CADENCE_WEEKLY, FamilyMember.CADENCE_BIWEEKLY, FamilyMember.CADENCE_MONTHLY);
    private static final List<String> BUCKETS =
            List.of(FamilyLedgerEntry.BUCKET_SPEND, FamilyLedgerEntry.BUCKET_SAVE, FamilyLedgerEntry.BUCKET_GIVE);
    private static final List<String> ENTRY_TYPES = List.of(
            FamilyLedgerEntry.TYPE_ALLOWANCE, FamilyLedgerEntry.TYPE_CHORE, FamilyLedgerEntry.TYPE_GIFT,
            FamilyLedgerEntry.TYPE_SPEND, FamilyLedgerEntry.TYPE_ADJUSTMENT);

    private final HouseholdService households;
    private final FamilyMemberRepository members;
    private final FamilyLedgerEntryRepository ledger;
    private final FamilyChoreRepository chores;
    private final EntitlementsClient entitlements;

    /** The caller's household id, or 409 when they aren't in one. */
    private Long householdOf(Long userId) {
        return households.activeMembership(userId)
                .map(HouseholdMember::getHouseholdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "Family mode lives in a household. Create or join one first."));
    }

    // ---------------------------------------------------------------- members

    @Transactional(readOnly = true)
    public List<FamilyMember> listMembers(Long userId) {
        return members.findByHouseholdIdAndStatusOrderByIdAsc(householdOf(userId), FamilyMember.STATUS_ACTIVE);
    }

    /** Load a member ONLY if the caller's household owns them. */
    @Transactional(readOnly = true)
    public FamilyMember requireMember(Long userId, Long memberId) {
        FamilyMember m = members.findById(memberId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Family member not found"));
        households.requireActiveMember(userId, m.getHouseholdId());
        return m;
    }

    @Transactional
    public FamilyMember addMember(Long userId, String name, Integer birthYear, BigDecimal allowanceAmount,
                                  String cadence, Integer allowanceDay, Integer spendPct, Integer savePct,
                                  Integer givePct) {
        Long householdId = householdOf(userId);
        // Owner-pays gate, matching household creation: the server refuses rather than trusting
        // the UI, and fails CLOSED if the plan can't be verified.
        entitlements.requireFeature(FEATURE_KEY);

        FamilyMember m = new FamilyMember();
        m.setHouseholdId(householdId);
        m.setCreatedByUserId(userId);
        apply(m, name, birthYear, allowanceAmount, cadence, allowanceDay, spendPct, savePct, givePct);
        return members.save(m);
    }

    @Transactional
    public FamilyMember updateMember(Long userId, Long memberId, String name, Integer birthYear,
                                     BigDecimal allowanceAmount, String cadence, Integer allowanceDay,
                                     Integer spendPct, Integer savePct, Integer givePct) {
        FamilyMember m = requireMember(userId, memberId);
        apply(m, name, birthYear, allowanceAmount, cadence, allowanceDay, spendPct, savePct, givePct);
        return members.save(m);
    }

    /**
     * Archive rather than delete. The ledger is the record of real money that changed hands;
     * removing a child from the view should not erase what they were paid.
     */
    @Transactional
    public void archiveMember(Long userId, Long memberId) {
        FamilyMember m = requireMember(userId, memberId);
        m.setStatus(FamilyMember.STATUS_ARCHIVED);
        members.save(m);
    }

    private void apply(FamilyMember m, String name, Integer birthYear, BigDecimal allowanceAmount,
                       String cadence, Integer allowanceDay, Integer spendPct, Integer savePct, Integer givePct) {
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A name is required");
        }
        BigDecimal amount = allowanceAmount == null ? BigDecimal.ZERO : allowanceAmount;
        if (amount.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Allowance can't be negative");
        }
        String cad = cadence == null || cadence.isBlank() ? FamilyMember.CADENCE_WEEKLY : cadence.toUpperCase();
        if (!CADENCES.contains(cad)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cadence must be one of " + CADENCES);
        }

        int spend = spendPct == null ? 100 : spendPct;
        int save = savePct == null ? 0 : savePct;
        int give = givePct == null ? 0 : givePct;
        if (spend < 0 || save < 0 || give < 0 || spend + save + give != 100) {
            // Rejected rather than silently normalized: a split that doesn't add up means the
            // parent's intent is ambiguous, and guessing it produces a wrong allowance forever.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Spend / save / give must each be 0 or more and add up to 100.");
        }

        m.setName(name.trim());
        m.setBirthYear(birthYear);
        m.setAllowanceAmount(amount);
        m.setAllowanceCadence(cad);
        m.setAllowanceDay(allowanceDay);
        m.setSplitSpendPct(spend);
        m.setSplitSavePct(save);
        m.setSplitGivePct(give);
    }

    // ---------------------------------------------------------------- ledger

    @Transactional(readOnly = true)
    public List<FamilyLedgerEntry> ledgerFor(Long userId, Long memberId) {
        requireMember(userId, memberId);
        return ledger.findByFamilyMemberIdOrderByOccurredOnDescIdDesc(memberId);
    }

    /**
     * Pay the allowance, split across the buckets by the member's configured percentages.
     * Writes one entry per non-zero bucket so the ledger explains itself.
     *
     * <p>Rounding goes to the SPEND bucket, so the entries always sum to exactly the amount
     * paid — a child's ledger that is a cent off is a support ticket.
     */
    @Transactional
    public List<FamilyLedgerEntry> payAllowance(Long userId, Long memberId, BigDecimal amountOverride,
                                                LocalDate occurredOn, String note) {
        FamilyMember m = requireMember(userId, memberId);
        BigDecimal amount = amountOverride != null ? amountOverride : m.getAllowanceAmount();
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Set an allowance amount first");
        }
        LocalDate on = occurredOn != null ? occurredOn : LocalDate.now();

        BigDecimal save = pctOf(amount, m.getSplitSavePct());
        BigDecimal give = pctOf(amount, m.getSplitGivePct());
        BigDecimal spend = amount.subtract(save).subtract(give); // absorbs the rounding

        List<FamilyLedgerEntry> written = new java.util.ArrayList<>();
        record Slice(String bucket, BigDecimal value) { }
        for (Slice s : List.of(
                new Slice(FamilyLedgerEntry.BUCKET_SPEND, spend),
                new Slice(FamilyLedgerEntry.BUCKET_SAVE, save),
                new Slice(FamilyLedgerEntry.BUCKET_GIVE, give))) {
            if (s.value().signum() <= 0) {
                continue;
            }
            written.add(write(userId, memberId, FamilyLedgerEntry.TYPE_ALLOWANCE, s.bucket(),
                    s.value(), on, note));
        }
        return written;
    }

    /** A manual entry: pocket money spent, a gift received, a correction. */
    @Transactional
    public FamilyLedgerEntry addEntry(Long userId, Long memberId, String entryType, String bucket,
                                      BigDecimal amount, LocalDate occurredOn, String note) {
        requireMember(userId, memberId);
        String type = entryType == null ? FamilyLedgerEntry.TYPE_ADJUSTMENT : entryType.toUpperCase();
        if (!ENTRY_TYPES.contains(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown entry type " + entryType);
        }
        String b = bucket == null ? FamilyLedgerEntry.BUCKET_SPEND : bucket.toUpperCase();
        if (!BUCKETS.contains(b)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bucket must be one of " + BUCKETS);
        }
        if (amount == null || amount.signum() == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount is required");
        }
        // SPEND is money leaving the bucket, so it is stored negative however the caller sent it.
        BigDecimal signed = FamilyLedgerEntry.TYPE_SPEND.equals(type)
                ? amount.abs().negate()
                : amount;
        return write(userId, memberId, type, b, signed,
                occurredOn != null ? occurredOn : LocalDate.now(), note);
    }

    /** Bucket balances + total for a member, folded from the ledger. */
    @Transactional(readOnly = true)
    public Map<String, BigDecimal> balances(Long userId, Long memberId) {
        requireMember(userId, memberId);
        Map<String, BigDecimal> out = new LinkedHashMap<>();
        for (String b : BUCKETS) {
            out.put(b, BigDecimal.ZERO);
        }
        for (FamilyLedgerEntry e : ledger.findByFamilyMemberIdOrderByOccurredOnDescIdDesc(memberId)) {
            out.merge(e.getBucket(), e.getAmount(), BigDecimal::add);
        }
        out.put("TOTAL", out.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add));
        return out;
    }

    private FamilyLedgerEntry write(Long userId, Long memberId, String type, String bucket,
                                    BigDecimal amount, LocalDate on, String note) {
        FamilyLedgerEntry e = new FamilyLedgerEntry();
        e.setFamilyMemberId(memberId);
        e.setEntryType(type);
        e.setBucket(bucket);
        e.setAmount(amount);
        e.setOccurredOn(on);
        e.setNote(note);
        e.setCreatedByUserId(userId);
        return ledger.save(e);
    }

    private static BigDecimal pctOf(BigDecimal amount, int pct) {
        return amount.multiply(BigDecimal.valueOf(pct))
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.DOWN);
    }

    // ---------------------------------------------------------------- chores

    @Transactional(readOnly = true)
    public List<FamilyChore> choresFor(Long userId, Long memberId) {
        requireMember(userId, memberId);
        return chores.findByFamilyMemberIdOrderByCompletedAtAscIdDesc(memberId);
    }

    @Transactional
    public FamilyChore addChore(Long userId, Long memberId, String title, BigDecimal reward) {
        requireMember(userId, memberId);
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A chore needs a title");
        }
        FamilyChore c = new FamilyChore();
        c.setFamilyMemberId(memberId);
        c.setTitle(title.trim());
        c.setRewardAmount(reward == null ? BigDecimal.ZERO : reward.abs());
        c.setCreatedByUserId(userId);
        return chores.save(c);
    }

    /**
     * Mark a chore done and pay its reward into the SPEND bucket. Idempotent: completing an
     * already-completed chore does not pay twice, which is the obvious double-tap bug.
     */
    @Transactional
    public FamilyChore completeChore(Long userId, Long memberId, Long choreId) {
        requireMember(userId, memberId);
        FamilyChore c = chores.findById(choreId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chore not found"));
        if (!c.getFamilyMemberId().equals(memberId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Chore not found");
        }
        if (c.getCompletedAt() != null) {
            return c;
        }
        c.setCompletedAt(LocalDateTime.now());
        chores.save(c);
        if (c.getRewardAmount().signum() > 0) {
            write(userId, memberId, FamilyLedgerEntry.TYPE_CHORE, FamilyLedgerEntry.BUCKET_SPEND,
                    c.getRewardAmount(), LocalDate.now(), "Chore: " + c.getTitle());
        }
        return c;
    }
}
