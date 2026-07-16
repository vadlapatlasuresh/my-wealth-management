package com.mywealthmanagement.auditservice.audit;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Periodically pins the audit chain head with a signed checkpoint.
 *
 * The keyed chain (V5/HMAC) stops someone who can write to the audit DB but doesn't hold the key.
 * It does not stop someone holding both — they can recompute every hash and the chain verifies
 * clean. A checkpoint closes that gap by publishing the head somewhere the DB writer doesn't
 * control: rewriting history then also means rewriting every published copy.
 *
 * The DB row is the convenience copy. The ANCHOR is the same value logged at INFO — logs ship off
 * this host and are retained independently, so the two can be compared later. A checkpoint that
 * lives only in the database it protects proves nothing on its own; that's the whole point of
 * emitting it twice.
 *
 * Stronger anchors (a GCS bucket with object versioning, or a WORM store) are a drop-in extension
 * of {@link #publish}: same value, another destination the DB writer can't reach.
 */
@Service
@RequiredArgsConstructor
public class AuditCheckpointService {

    private static final Logger log = LoggerFactory.getLogger(AuditCheckpointService.class);

    private final AuditEventRepository eventRepository;
    private final AuditCheckpointRepository checkpointRepository;
    private final AuditChainService chainService;
    private final AuditChainKeyHolder keyHolder;

    /** Daily at 03:15. Cheap: one head read, one count, one insert, one log line. */
    @Scheduled(cron = "${audit.checkpoint.cron:0 15 3 * * *}")
    public void scheduledCheckpoint() {
        try {
            AuditCheckpoint cp = createCheckpoint();
            log.info("[AuditCheckpoint] anchored chain head — id={} count={} head={} sig={} at={}",
                    cp.getId(), cp.getEventCount(), cp.getChainHead(), cp.getSignature(), cp.getCreatedAt());
        } catch (Exception e) {
            // Never let a checkpoint failure take the service down; it retries tomorrow, and the
            // gap itself is visible in the checkpoint history.
            log.error("[AuditCheckpoint] failed to write checkpoint: {}", e.getMessage(), e);
        }
    }

    /** Snapshot the current head and sign it. */
    public AuditCheckpoint createCheckpoint() {
        AuditEvent last = eventRepository.findTopByOrderByIdDesc();
        AuditCheckpoint cp = new AuditCheckpoint();
        cp.setChainHead(chainService.currentHead());
        cp.setLastEventId(last == null ? null : last.getId());
        cp.setEventCount(eventRepository.count());
        cp.setCreatedAt(LocalDateTime.now());
        cp.setSignature(sign(cp));
        AuditCheckpoint saved = checkpointRepository.save(cp);
        publish(saved);
        return saved;
    }

    /**
     * Emit the checkpoint out-of-band. Today that means the service log; the value is what matters,
     * not the destination, so add further sinks here rather than changing how it's computed.
     */
    private void publish(AuditCheckpoint cp) {
        log.info("[AuditCheckpoint] AUDIT-ANCHOR head={} count={} lastEventId={} at={} sig={}",
                cp.getChainHead(), cp.getEventCount(), cp.getLastEventId(), cp.getCreatedAt(), cp.getSignature());
    }

    /**
     * Verify every checkpoint's own signature, and that the chain still agrees with it.
     *
     * Two distinct failures, worth distinguishing:
     *  - a bad signature means the CHECKPOINT was edited
     *  - a good signature whose recorded head no longer matches the event at that id means the
     *    EVENTS were rewritten after the fact — the case a bare chain can't detect.
     */
    public CheckpointStatus verifyCheckpoints() {
        List<AuditCheckpoint> all = checkpointRepository.findAllByOrderByIdAsc();
        for (AuditCheckpoint cp : all) {
            if (!sign(cp).equals(cp.getSignature())) {
                return new CheckpointStatus(false, all.size(), cp.getId(),
                        "checkpoint signature mismatch — the checkpoint row was altered");
            }
            if (cp.getLastEventId() == null) continue; // checkpoint taken on an empty log
            AuditEvent atHead = eventRepository.findById(cp.getLastEventId()).orElse(null);
            if (atHead == null) {
                return new CheckpointStatus(false, all.size(), cp.getId(),
                        "event " + cp.getLastEventId() + " named by this checkpoint no longer exists");
            }
            if (!cp.getChainHead().equals(atHead.getEntryHash())) {
                return new CheckpointStatus(false, all.size(), cp.getId(),
                        "event " + cp.getLastEventId() + " no longer hashes to the checkpointed head "
                                + "— history was rewritten after this checkpoint");
            }
        }
        return new CheckpointStatus(true, all.size(), null, "ok");
    }

    /** HMAC over the checkpoint's own fields, with the same key that keys the chain. */
    private String sign(AuditCheckpoint cp) {
        String canonical = String.join("|",
                cp.getChainHead() == null ? "" : cp.getChainHead(),
                cp.getLastEventId() == null ? "" : cp.getLastEventId().toString(),
                cp.getEventCount() == null ? "" : cp.getEventCount().toString(),
                cp.getCreatedAt() == null ? "" : cp.getCreatedAt().toString());
        return AuditChainService.hmacHex(keyHolder.key(), canonical);
    }

    /** Result of a checkpoint verification sweep. */
    public record CheckpointStatus(boolean valid, int count, Long brokenAtId, String detail) {}
}
