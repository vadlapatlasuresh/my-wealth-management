package com.mywealthmanagement.paymentservice.ledger;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * The append-only money ledger.
 *
 * The only way to write here is {@link #append}. There is no update and no delete, and adding one
 * would defeat the purpose: a correction is a NEW entry that reverses the original
 * ({@link #reverse}). That is what lets the history answer "how did this balance happen, and who
 * did that" instead of only "what is it now".
 */
@Service
@RequiredArgsConstructor
public class LedgerService {

    private final LedgerEntryRepository repository;

    /**
     * Append an entry and return it. Idempotent on {@code idempotencyKey}: calling twice with the
     * same key returns the FIRST entry rather than writing a second.
     *
     * That is not a nicety. Execution retries after a timeout are routine, and without this the
     * natural failure mode is refunding a customer twice — the kind of bug that is invisible until
     * someone reconciles the month.
     *
     * synchronized because balance_after is read-then-written: two concurrent appends for the same
     * customer would otherwise both read the old balance and write the same balance_after, silently
     * corrupting the running total. Correct for the single payment-service instance this deploys
     * as; a horizontally scaled one needs a per-user DB lock (SELECT ... FOR UPDATE) instead.
     */
    @Transactional
    public synchronized LedgerEntry append(LedgerEntry entry) {
        if (entry.getIdempotencyKey() != null) {
            LedgerEntry existing = repository.findByIdempotencyKey(entry.getIdempotencyKey()).orElse(null);
            if (existing != null) {
                return existing; // already done — never write a second time
            }
        }
        LedgerEntry last = repository.findTopByUserIdOrderByIdDesc(entry.getUserId());
        long previousBalance = last == null ? 0L : last.getBalanceAfter();
        entry.setBalanceAfter(previousBalance + entry.getAmountCents());
        // Microseconds: the store rounds nanoseconds away, and a timestamp that changes between
        // write and read makes ordering and reconciliation subtly wrong. Same trap that made the
        // audit chain unverifiable on Linux.
        entry.setCreatedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        return repository.save(entry);
    }

    /**
     * Reverse an existing entry with an equal-and-opposite one. The original stays exactly as it
     * was — reversing is how you correct a ledger, editing is how you lose an audit.
     */
    @Transactional
    public LedgerEntry reverse(LedgerEntry original, String reason, String actorId, String idempotencyKey) {
        LedgerEntry reversal = new LedgerEntry();
        reversal.setUserId(original.getUserId());
        reversal.setEntryType(LedgerEntry.TYPE_REVERSAL);
        reversal.setAmountCents(-original.getAmountCents());
        reversal.setCurrency(original.getCurrency());
        reversal.setSource(original.getSource());
        reversal.setReversesId(original.getId());
        reversal.setMemo(reason);
        reversal.setCreatedBy(actorId);
        reversal.setIdempotencyKey(idempotencyKey);
        return append(reversal);
    }

    /** Current balance: positive = the customer owes us, negative = we owe them. */
    public long balanceFor(String userId) {
        LedgerEntry last = repository.findTopByUserIdOrderByIdDesc(userId);
        return last == null ? 0L : last.getBalanceAfter();
    }

    /** Newest-first history. */
    public List<LedgerEntry> historyFor(String userId) {
        return repository.findByUserIdOrderByIdDesc(userId);
    }

    /**
     * The newest provider charge reference for this customer, if any — what a refund is issued
     * against. Null when there is nothing refundable, in which case the answer is a CREDIT.
     */
    public String latestChargeRef(String userId) {
        return repository.findByUserIdOrderByIdDesc(userId).stream()
                .filter(e -> LedgerEntry.TYPE_CHARGE.equals(e.getEntryType()))
                .filter(e -> e.getExternalRef() != null && !e.getExternalRef().isBlank())
                .map(LedgerEntry::getExternalRef)
                .findFirst()
                .orElse(null);
    }

    /**
     * Independent recomputation of the balance vs. the stored running total.
     *
     * These must agree. When they don't, the ledger has been written by something that bypassed
     * {@link #append} — a bug, a migration, or a hand-edit — and the balance a customer is being
     * shown is wrong. Feeds the LEDGER_DRIFT anomaly rule.
     */
    public long driftFor(String userId) {
        return repository.sumAmountsForUser(userId) - balanceFor(userId);
    }
}
