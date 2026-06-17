package com.mywealthmanagement.realestateservice.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.Map;

/**
 * Emits domain audit events (e.g. deal create/update) to the audit-service so sensitive
 * actions land in the tamper-evident chain. Fire-and-forget: never blocks or breaks the
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
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("userId", userId);
            body.put("actorType", userId != null ? "USER" : "ANONYMOUS");
            body.put("action", action);
            body.put("service", "real-estate");
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
}
