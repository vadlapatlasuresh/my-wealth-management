package com.mywealthmanagement.paymentservice.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.Map;

/**
 * Emits domain audit events (e.g. bill-pay create/cancel) to the audit-service so money
 * movements land in the tamper-evident chain. Fire-and-forget: never blocks or breaks the
 * request if audit-service is unavailable.
 */
@Component
public class AuditClient {

    private static final Logger log = LoggerFactory.getLogger(AuditClient.class);

    @Value("${audit.uri:http://localhost:8090}")
    private String auditUri;

    @Value("${audit.ingest.key:dev-internal-audit-key}")
    private String ingestKey;

    private final RestClient http = RestClient.create();

    public void record(String userId, String action, String outcome, String metadata) {
        Map<String, Object> body = new HashMap<>();
        body.put("userId", userId);
        body.put("actorType", userId != null ? "USER" : "ANONYMOUS");
        body.put("action", action);
        body.put("service", "payment");
        body.put("outcome", outcome);
        body.put("metadata", metadata);
        post(body);
    }

    /**
     * Record an OPS action against a customer's money — who moved it, for whom, and why.
     *
     * Every state change of an adjustment goes through here. The request-level capture at the
     * gateway can say "ops user 7 POSTed /adjustments"; only this can say that 7 proposed a $40
     * refund to customer 42 for BILLING_ERROR and that 9 — not 7 — approved it.
     *
     * @param actorId      ops_users id of the acting staff member
     * @param targetUserId the CUSTOMER whose money is involved
     * @param reason       the stated justification
     * @param beforeJson   state before, or null
     * @param afterJson    state after, or null
     */
    public void recordOps(String actorId, String action, String outcome, String targetUserId,
                          String reason, String beforeJson, String afterJson) {
        Map<String, Object> body = new HashMap<>();
        // userId stays the actor for backward compatibility with /audit/me; actorId/actorKind are
        // what new queries use.
        body.put("userId", actorId);
        body.put("actorType", "OPS");
        body.put("actorKind", "OPS");
        body.put("actorId", actorId);
        body.put("targetUserId", targetUserId);
        body.put("action", action);
        body.put("service", "payment");
        body.put("outcome", outcome);
        body.put("reason", reason);
        body.put("beforeJson", beforeJson);
        body.put("afterJson", afterJson);
        post(body);
    }

    /** Fire-and-forget: auditing must never break the flow it records. */
    private void post(Map<String, Object> body) {
        try {
            http.post()
                    .uri(auditUri + "/api/v1/audit/events")
                    .header("X-Internal-Key", ingestKey)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.debug("audit emit skipped: {}", e.getMessage());
        }
    }
}
