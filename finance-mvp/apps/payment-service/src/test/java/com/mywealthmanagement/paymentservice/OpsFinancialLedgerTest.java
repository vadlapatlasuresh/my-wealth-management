package com.mywealthmanagement.paymentservice;

import com.mywealthmanagement.paymentservice.ledger.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Sort;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The controls that stop money going wrong.
 *
 * Each test here is an attempt to do the thing the design forbids — approve your own refund, write
 * the same refund twice, sneak a negative amount through — because a control nobody has tried to
 * break is a control nobody knows works.
 */
@SpringBootTest
class OpsFinancialLedgerTest {

    private static final String AGENT = "7";
    private static final String SUPERVISOR = "9";
    private static final String CUSTOMER = "42";

    @Autowired OpsAdjustmentService adjustments;
    @Autowired OpsAdjustmentRepository adjustmentRepo;
    @Autowired LedgerService ledger;
    @Autowired LedgerEntryRepository ledgerRepo;

    @BeforeEach
    void clean() {
        // Newest first: reversals point at the entry they reverse (reverses_id), so a plain
        // deleteAll() can try to remove an original before its reversal and trip the FK. That the
        // constraint bites here is a good sign — it is the same one that stops a reversal being
        // orphaned in production.
        ledgerRepo.deleteAll(ledgerRepo.findAll(Sort.by(Sort.Direction.DESC, "id")));
        adjustmentRepo.deleteAll();
    }

    /** Small amounts go straight through — but still fully recorded, and still on the ledger. */
    @Test
    void smallAdjustmentsExecuteWithoutASecondApprover() {
        OpsAdjustment a = adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_CREDIT, 500,
                "SERVICE_ISSUE", "Outage on the 3rd, one day credited", null);

        assertEquals(OpsAdjustment.STATUS_EXECUTED, a.getStatus());
        assertEquals("AUTO", a.getDecidedBy());
        assertNotNull(a.getLedgerEntryId(), "an executed adjustment must have written a ledger entry");
        // Credit reduces what they owe us: the ledger amount is negative regardless of the
        // positive amount the caller asked for.
        assertEquals(-500L, ledger.balanceFor(CUSTOMER));
    }

    /** At or above the threshold, nothing moves until someone else says so. */
    @Test
    void largeAdjustmentsWaitForApproval() {
        OpsAdjustment a = adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_REFUND, 9_000,
                "BILLING_ERROR", "Charged twice for the June invoice", "TKT-1");

        assertEquals(OpsAdjustment.STATUS_PENDING_APPROVAL, a.getStatus());
        assertNull(a.getLedgerEntryId());
        assertEquals(0L, ledger.balanceFor(CUSTOMER), "no money may move before approval");
        assertEquals(1, adjustments.pendingQueue().size());
    }

    /**
     * THE control. One agent must not be able to move money alone — this is what the whole
     * maker-checker design exists for.
     */
    @Test
    void anAgentCannotApproveTheirOwnAdjustment() {
        OpsAdjustment a = adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_REFUND, 9_000,
                "BILLING_ERROR", "Charged twice for the June invoice", null);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> adjustments.approve(AGENT, a.getId(), "looks fine to me"));
        assertEquals(409, e.getStatusCode().value());

        assertEquals(OpsAdjustment.STATUS_PENDING_APPROVAL,
                adjustmentRepo.findById(a.getId()).orElseThrow().getStatus());
        assertEquals(0L, ledger.balanceFor(CUSTOMER), "a self-approval must not move money");
    }

    /**
     * Four-eyes at the STORAGE layer, proven by bypassing the service entirely.
     *
     * The service check above is the friendly error. This is the one that matters: it holds for a
     * future refactor that forgets the check, a code path nobody thought about, or a hand-written
     * UPDATE at 2am. Writing the constraint is easy; knowing it's actually enforced needs this.
     */
    @Test
    void theDatabaseItselfRefusesASelfApproval() {
        OpsAdjustment a = adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_REFUND, 9_000,
                "BILLING_ERROR", "Charged twice for the June invoice", null);

        OpsAdjustment raw = adjustmentRepo.findById(a.getId()).orElseThrow();
        raw.setDecidedBy(AGENT); // the same person who requested it
        raw.setStatus(OpsAdjustment.STATUS_APPROVED);

        assertThrows(Exception.class, () -> adjustmentRepo.saveAndFlush(raw),
                "the CHECK constraint must reject decided_by = requested_by even without the service");
    }

    @Test
    void aSecondPairOfEyesCanApproveAndItExecutes() {
        OpsAdjustment a = adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_REFUND, 9_000,
                "BILLING_ERROR", "Charged twice for the June invoice", null);

        OpsAdjustment approved = adjustments.approve(SUPERVISOR, a.getId(), "verified against the invoice");

        assertEquals(OpsAdjustment.STATUS_EXECUTED, approved.getStatus());
        assertEquals(SUPERVISOR, approved.getDecidedBy());
        assertEquals(AGENT, approved.getRequestedBy(), "the maker is still recorded");
        assertEquals(-9_000L, ledger.balanceFor(CUSTOMER));
    }

    /** Rejection is terminal, and leaves the money untouched. */
    @Test
    void rejectionIsTerminalAndMovesNoMoney() {
        OpsAdjustment a = adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_REFUND, 9_000,
                "BILLING_ERROR", "Charged twice for the June invoice", null);

        OpsAdjustment rejected = adjustments.reject(SUPERVISOR, a.getId(), "not a duplicate — two separate months");
        assertEquals(OpsAdjustment.STATUS_REJECTED, rejected.getStatus());
        assertEquals(0L, ledger.balanceFor(CUSTOMER));

        // No revival: a rejected adjustment is re-proposed, never re-decided.
        assertThrows(ResponseStatusException.class,
                () -> adjustments.approve(SUPERVISOR, a.getId(), "changed my mind"));
    }

    @Test
    void rejectingRequiresAReason() {
        OpsAdjustment a = adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_REFUND, 9_000,
                "BILLING_ERROR", "Charged twice for the June invoice", null);

        ResponseStatusException e = assertThrows(ResponseStatusException.class,
                () -> adjustments.reject(SUPERVISOR, a.getId(), "  "));
        assertEquals(400, e.getStatusCode().value());
    }

    /**
     * Execution retries after a timeout are routine. Refunding someone twice because of one is the
     * failure mode this guards, and it's invisible until someone reconciles the month.
     */
    @Test
    void theLedgerRefusesToWriteTheSameAdjustmentTwice() {
        LedgerEntry first = new LedgerEntry();
        first.setUserId(CUSTOMER);
        first.setEntryType(LedgerEntry.TYPE_REFUND);
        first.setAmountCents(-2_000L);
        first.setSource(LedgerEntry.SOURCE_OPS_ADJUSTMENT);
        first.setIdempotencyKey("adj-999");
        LedgerEntry saved = ledger.append(first);

        LedgerEntry retry = new LedgerEntry();
        retry.setUserId(CUSTOMER);
        retry.setEntryType(LedgerEntry.TYPE_REFUND);
        retry.setAmountCents(-2_000L);
        retry.setSource(LedgerEntry.SOURCE_OPS_ADJUSTMENT);
        retry.setIdempotencyKey("adj-999");
        LedgerEntry second = ledger.append(retry);

        assertEquals(saved.getId(), second.getId(), "a retry must return the original entry, not write a new one");
        assertEquals(-2_000L, ledger.balanceFor(CUSTOMER), "the customer must not be refunded twice");
        assertEquals(1, ledgerRepo.findByUserIdOrderByIdDesc(CUSTOMER).size());
    }

    /** The running balance must track the entries, because that's what the customer is shown. */
    @Test
    void theRunningBalanceTracksEveryEntry() {
        appendCharge(10_000L);
        adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_CREDIT, 1_500,
                "SERVICE_ISSUE", "Outage credit for the 3rd", null);

        assertEquals(8_500L, ledger.balanceFor(CUSTOMER));
        assertEquals(0L, ledger.driftFor(CUSTOMER), "the running balance must agree with the sum of entries");
    }

    /** A correction is a new reversing entry — the original stays exactly as it was. */
    @Test
    void correctionsReverseRatherThanEdit() {
        LedgerEntry charge = appendCharge(10_000L);
        LedgerEntry reversal = ledger.reverse(charge, "charged the wrong account", SUPERVISOR, "rev-1");

        assertEquals(LedgerEntry.TYPE_REVERSAL, reversal.getEntryType());
        assertEquals(charge.getId(), reversal.getReversesId());
        assertEquals(-10_000L, reversal.getAmountCents());
        assertEquals(0L, ledger.balanceFor(CUSTOMER));
        // The original is untouched — that is the whole point.
        LedgerEntry original = ledgerRepo.findById(charge.getId()).orElseThrow();
        assertEquals(10_000L, original.getAmountCents());
    }

    /** Direction comes from the kind, never from the sign a caller passes. */
    @Test
    void aNegativeOrZeroAmountIsRejected() {
        assertEquals(400, assertThrows(ResponseStatusException.class, () ->
                adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_CREDIT, -500,
                        "SERVICE_ISSUE", "trying to charge them via a credit", null)
        ).getStatusCode().value());

        assertEquals(400, assertThrows(ResponseStatusException.class, () ->
                adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_CREDIT, 0,
                        "SERVICE_ISSUE", "a zero adjustment is a mistake", null)
        ).getStatusCode().value());
    }

    /** Free text alone can't answer "how much did we refund for BILLING_ERROR last quarter". */
    @Test
    void reasonCodeAndNoteAreBothRequired() {
        assertEquals(400, assertThrows(ResponseStatusException.class, () ->
                adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_CREDIT, 500,
                        "MADE_UP_CODE", "a perfectly good note", null)
        ).getStatusCode().value());

        assertEquals(400, assertThrows(ResponseStatusException.class, () ->
                adjustments.propose(AGENT, CUSTOMER, OpsAdjustment.KIND_CREDIT, 500,
                        "SERVICE_ISSUE", "asdf", null)
        ).getStatusCode().value());
    }

    @Test
    void unknownKindsAreRejected() {
        assertEquals(400, assertThrows(ResponseStatusException.class, () ->
                adjustments.propose(AGENT, CUSTOMER, "CHARGE_THEM_MORE", 500,
                        "SERVICE_ISSUE", "definitely not allowed", null)
        ).getStatusCode().value());
    }

    private LedgerEntry appendCharge(long cents) {
        LedgerEntry e = new LedgerEntry();
        e.setUserId(CUSTOMER);
        e.setEntryType(LedgerEntry.TYPE_CHARGE);
        e.setAmountCents(cents);
        e.setSource(LedgerEntry.SOURCE_STRIPE);
        e.setExternalRef("ch_test_1");
        e.setCreatedBy("SYSTEM");
        return ledger.append(e);
    }
}
