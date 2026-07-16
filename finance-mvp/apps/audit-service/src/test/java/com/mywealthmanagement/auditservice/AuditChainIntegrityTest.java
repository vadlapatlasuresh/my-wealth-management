package com.mywealthmanagement.auditservice;

import com.mywealthmanagement.auditservice.audit.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

/**
 * The tamper-evidence claims, tested by actually tampering.
 *
 * "The audit log is tamper-evident" is worth exactly as much as the test that mutates a row and
 * shows verify() catching it. Each test below performs the specific attack it claims to defend
 * against — editing a past row, editing the semantic fields, rewriting the chain wholesale — and
 * asserts the trail says so.
 */
@SpringBootTest
class AuditChainIntegrityTest {

    @Autowired AuditEventRepository events;
    @Autowired AuditCheckpointRepository checkpoints;
    @Autowired AuditChainService chain;
    @Autowired AuditCheckpointService checkpointService;

    @BeforeEach
    void clean() {
        checkpoints.deleteAll();
        events.deleteAll();
    }

    private AuditEvent append(String action, String actorId, String targetUserId, String reason) {
        AuditEvent e = new AuditEvent();
        e.setAction(action);
        e.setActorKind("OPS");
        e.setActorId(actorId);
        e.setUserId(actorId);
        e.setActorType("OPS");
        e.setTargetUserId(targetUserId);
        e.setReason(reason);
        e.setOutcome("SUCCESS");
        e.setService("ops");
        return chain.append(e);
    }

    @Test
    void newEventsAreWrittenWithTheKeyedChain() {
        AuditEvent e = append("ops.customer.view", "7", "42", null);
        assertEquals(2, e.getHashVersion(), "new rows must use the keyed HMAC chain, not legacy SHA-256");
        assertNotNull(e.getEntryHash());
        assertTrue(chain.verify().valid());
    }

    @Test
    void anUntouchedChainVerifies() {
        append("ops.customer.view", "7", "42", null);
        append("ops.pii.reveal", "7", "42", "Caller verifying tax id");
        append("ops.customer.view", "9", "43", null);

        AuditChainService.ChainStatus status = chain.verify();
        assertTrue(status.valid(), status.detail());
        assertEquals(3, status.count());
    }

    /** The classic: quietly edit a past row and hope nobody notices. */
    @Test
    void editingAPastEventBreaksTheChain() {
        AuditEvent first = append("ops.customer.view", "7", "42", null);
        append("ops.customer.view", "7", "43", null);
        append("ops.customer.view", "7", "44", null);

        // Rewrite history: make it look like someone else did it.
        first.setActorId("999");
        events.saveAndFlush(first);

        AuditChainService.ChainStatus status = chain.verify();
        assertFalse(status.valid(), "an edited row must not verify");
        assertEquals(first.getId(), status.brokenAtId());
    }

    /**
     * The whole reason the stated justification is inside the hash: a trail whose "why" can be
     * edited freely is not an audit trail. Rewriting a PII access from "caller verifying tax id"
     * to "routine check" is exactly the edit someone would want to make after the fact.
     */
    @Test
    void editingTheStatedReasonBreaksTheChain() {
        AuditEvent reveal = append("ops.pii.reveal", "7", "42", "Caller verifying tax id");
        assertTrue(chain.verify().valid());

        reveal.setReason("Routine check");
        events.saveAndFlush(reveal);

        assertFalse(chain.verify().valid(), "the stated reason must be tamper-evident");
    }

    /** Likewise for who was acted upon — the field the whole actor/target split exists for. */
    @Test
    void editingTheTargetBreaksTheChain() {
        AuditEvent reveal = append("ops.pii.reveal", "7", "42", "Caller verifying tax id");
        assertTrue(chain.verify().valid());

        reveal.setTargetUserId("43");
        events.saveAndFlush(reveal);

        assertFalse(chain.verify().valid(), "who was acted upon must be tamper-evident");
    }

    /** Deleting a row leaves a hole the links can't bridge. */
    @Test
    void deletingAnEventBreaksTheChain() {
        append("ops.customer.view", "7", "42", null);
        AuditEvent middle = append("ops.pii.reveal", "7", "42", "Caller verifying tax id");
        append("ops.customer.view", "7", "44", null);

        events.deleteById(middle.getId());
        events.flush();

        assertFalse(chain.verify().valid(), "a deleted row must leave the chain broken");
    }

    /**
     * The attack the unkeyed chain could not survive: an insider with DB write access edits a row
     * AND recomputes every later hash, so the chain verifies clean again.
     *
     * Under HMAC they cannot produce valid hashes without the key, so the best they can do is
     * write plausible-looking ones and re-link the chain around them. That must still fail —
     * which is the entire reason the digest is keyed.
     */
    @Test
    void relinkingTheChainWithForgedHashesDoesNotRepairIt() {
        AuditEvent first = append("ops.pii.reveal", "7", "42", "Caller verifying tax id");
        AuditEvent second = append("ops.customer.view", "7", "43", null);

        // Tamper, then cover it up: forge a hash for the edited row and re-link its successor so
        // the prev_hash links all still line up. Only the hashes themselves are wrong.
        String forged = "a".repeat(64);
        first.setReason("Routine check");
        first.setEntryHash(forged);
        events.saveAndFlush(first);
        second.setPrevHash(forged);
        events.saveAndFlush(second);

        AuditChainService.ChainStatus status = chain.verify();
        assertFalse(status.valid(), "a chain re-linked with forged hashes must not verify");
        assertEquals("hash mismatch", status.detail(),
                "the links line up, so it is the keyed digest that catches this");
    }

    // ---- Checkpoints ---------------------------------------------------------------------

    @Test
    void checkpointsPinTheHeadAndVerify() {
        append("ops.customer.view", "7", "42", null);
        AuditCheckpoint cp = checkpointService.createCheckpoint();

        assertNotNull(cp.getSignature());
        assertEquals(1L, cp.getEventCount());
        assertTrue(checkpointService.verifyCheckpoints().valid());
    }

    /** Editing the checkpoint itself is detected by its own signature. */
    @Test
    void editingACheckpointIsDetected() {
        append("ops.customer.view", "7", "42", null);
        AuditCheckpoint cp = checkpointService.createCheckpoint();

        cp.setChainHead("0000000000000000000000000000000000000000000000000000000000000000");
        checkpoints.saveAndFlush(cp);

        AuditCheckpointService.CheckpointStatus status = checkpointService.verifyCheckpoints();
        assertFalse(status.valid());
        assertEquals(cp.getId(), status.brokenAtId());
        assertTrue(status.detail().contains("signature"));
    }

    /**
     * The gap checkpoints exist to close.
     *
     * Someone holding the key can rewrite a row AND re-derive a genuinely valid hash for it, so
     * the chain verifies clean and detects nothing. A checkpoint taken beforehand still pins the
     * OLD head, so the rewrite shows up anyway — the checkpoint doesn't care how the new hash was
     * produced, only that the head at that event no longer matches what was published.
     */
    @Test
    void aRewrittenHistoryIsCaughtByAnEarlierCheckpoint() {
        AuditEvent reveal = append("ops.pii.reveal", "7", "42", "Caller verifying tax id");
        AuditCheckpoint cp = checkpointService.createCheckpoint();
        assertTrue(checkpointService.verifyCheckpoints().valid());

        // Stand in for "attacker holds the key and re-derives a valid hash": whatever they
        // compute, it is not the value that was checkpointed.
        reveal.setReason("Routine check");
        reveal.setEntryHash("b".repeat(64));
        events.saveAndFlush(reveal);

        AuditCheckpointService.CheckpointStatus status = checkpointService.verifyCheckpoints();
        assertFalse(status.valid(), "the checkpoint must still pin the pre-tamper head");
        assertEquals(cp.getId(), status.brokenAtId());
        assertTrue(status.detail().contains("rewritten"), status.detail());
    }
}
