package com.mywealthmanagement.secretsservice.secret;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.Map;

/**
 * Emits secret.* events to the existing audit-service hash chain. Fire-and-forget:
 * never blocks or fails a secret operation if audit-service is unavailable.
 * NEVER includes the secret value — only name/scope/version/principal.
 */
@Component
public class AuditClient {

    private static final Logger log = LoggerFactory.getLogger(AuditClient.class);

    @Value("${audit.uri:http://localhost:8090}")
    private String auditUri;

    @Value("${audit.ingest.key:${AUDIT_INGEST_KEY:dev-internal-audit-key}}")
    private String ingestKey;

    private final RestClient http = RestClient.create();

    /** action e.g. "secret.read"; outcome "SUCCESS"|"DENIED"; detail goes to metadata (no value!). */
    public void record(String action, String outcome, String principal, String metadata) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("action", action);
            body.put("actorType", "SYSTEM");
            body.put("service", "secrets");
            body.put("outcome", outcome);
            body.put("userId", principal);
            body.put("metadata", metadata);
            http.post()
                    .uri(auditUri + "/api/v1/audit/events")
                    .header("X-Internal-Key", ingestKey)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.debug("audit emit skipped ({}): {}", action, e.getMessage());
        }
    }
}
