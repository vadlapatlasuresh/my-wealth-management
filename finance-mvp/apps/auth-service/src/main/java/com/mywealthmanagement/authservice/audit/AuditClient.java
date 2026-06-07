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
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("userId", userId);
            body.put("actorType", userId != null ? "USER" : "ANONYMOUS");
            body.put("action", action);
            body.put("service", "auth");
            body.put("outcome", outcome);
            body.put("metadata", metadata);
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
