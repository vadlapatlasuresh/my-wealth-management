package com.mywealthmanagement.authservice.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Emits domain-level audit events (login success/failure, registration) to the audit-service so the
 * actor (userId) and outcome are recorded — richer than the gateway's request-level capture.
 * Fire-and-forget: never blocks or breaks the auth flow if audit-service is unavailable.
 */
@Component
public class AuditClient {

    private static final Logger log = LoggerFactory.getLogger(AuditClient.class);

    @Value("${audit.uri:http://localhost:8090}")
    private String auditUri;

    @Value("${audit.ingest.key:dev-internal-audit-key}")
    private String ingestKey;

    private final RestClient http = RestClient.create();

    /** Record an auth event. metadata is an optional short string (e.g. attempted email). */
    public void record(String userId, String action, String outcome, String metadata) {
        Map<String, Object> body = new HashMap<>();
        body.put("userId", userId);
        body.put("actorType", userId != null ? "USER" : "ANONYMOUS");
        body.put("action", action);
        body.put("service", "auth");
        body.put("outcome", outcome);
        body.put("metadata", metadata);
        post(body);
    }

    /**
     * Record an OPS action against a customer — the semantic tier of the audit trail.
     *
     * The gateway already captures the HTTP request, but it can only ever say "ops user 7 did
     * GET /api/v1/support/users/42". It cannot say WHY, or what changed. This is what makes the
     * trail answer the questions that actually get asked in an incident or an access review:
     * who opened this customer's record, on what grounds, and what did they change?
     *
     * @param actorId      ops_users id of the agent performing the action
     * @param action       semantic verb, e.g. ops.customer.view / ops.pii.reveal
     * @param outcome      SUCCESS | FAILURE | DENIED
     * @param targetUserId the CUSTOMER being acted upon — this is what makes "who touched
     *                     customer 42" a one-index query instead of a scan over URL paths
     * @param reason       the agent's stated justification; required for sensitive actions
     * @param beforeJson   state before the change, or null for reads
     * @param afterJson    state after the change, or null for reads
     */
    public void recordOps(String actorId, String action, String outcome, String targetUserId,
                          String reason, String beforeJson, String afterJson) {
        Map<String, Object> body = new HashMap<>();
        // userId stays the actor for backward compatibility with /audit/me and the existing
        // member timeline; actorId/actorKind are the fields new queries should use.
        body.put("userId", actorId);
        body.put("actorType", "OPS");
        body.put("actorKind", "OPS");
        body.put("actorId", actorId);
        body.put("targetUserId", targetUserId);
        body.put("action", action);
        body.put("service", "ops");
        body.put("outcome", outcome);
        body.put("reason", reason);
        body.put("beforeJson", beforeJson);
        body.put("afterJson", afterJson);
        post(body);
    }

    /**
     * Everything ever done TO this customer, by anyone — the access record for one person.
     * Server-to-server via the internal key; the caller is responsible for the audit.query check.
     *
     * Unlike {@link #record}, this is NOT fire-and-forget-safe to fail silently in spirit: an
     * empty list here reads as "nobody ever accessed this customer", which is a very different
     * claim from "the audit service is down". Returns null on failure so the caller can say so.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchTargetHistory(String targetUserId, int limit) {
        try {
            return http.get()
                    .uri(auditUri + "/api/v1/audit/target/" + targetUserId + "?size=" + limit)
                    .header("X-Internal-Key", ingestKey)
                    .retrieve()
                    .body(List.class);
        } catch (Exception e) {
            log.warn("audit target history unavailable for {}: {}", targetUserId, e.getMessage());
            return null;
        }
    }

    /** Everything a given ops user did, plus how many distinct customers they touched. */
    @SuppressWarnings("unchecked")
    public Map<String, Object> fetchActorHistory(String actorId, int days, int limit) {
        try {
            return http.get()
                    .uri(auditUri + "/api/v1/audit/actor/" + actorId + "?days=" + days + "&size=" + limit)
                    .header("X-Internal-Key", ingestKey)
                    .retrieve()
                    .body(Map.class);
        } catch (Exception e) {
            log.warn("audit actor history unavailable for {}: {}", actorId, e.getMessage());
            return null;
        }
    }

    /** Fire-and-forget POST: auditing must never break the flow it is recording. */
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

    /**
     * Fetch a user's recent activity from the audit-service (server-to-server, internal key).
     * Returns an empty list if the audit-service is unavailable. When onlyIssues is true, keeps
     * only failed/denied actions (the "issues encountered").
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> fetchUserActivity(String userId, boolean onlyIssues, int limit) {
        try {
            List<Map<String, Object>> rows = http.get()
                    .uri(auditUri + "/api/v1/audit/users/" + userId + "?size=" + limit)
                    .header("X-Internal-Key", ingestKey)
                    .retrieve()
                    .body(List.class);
            if (rows == null) return Collections.emptyList();
            if (!onlyIssues) return rows;
            return rows.stream().filter(r -> {
                Object outcome = r.get("outcome");
                Object status = r.get("status");
                boolean failedOutcome = outcome != null && !"SUCCESS".equalsIgnoreCase(String.valueOf(outcome));
                boolean errorStatus = status instanceof Number && ((Number) status).intValue() >= 400;
                return failedOutcome || errorStatus;
            }).toList();
        } catch (Exception e) {
            log.debug("audit fetch skipped: {}", e.getMessage());
            return Collections.emptyList();
        }
    }
}
