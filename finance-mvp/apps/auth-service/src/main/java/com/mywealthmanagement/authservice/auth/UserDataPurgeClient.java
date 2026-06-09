package com.mywealthmanagement.authservice.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Orchestrates the cross-service data purge for account deletion (GDPR/CCPA
 * right-to-delete). Calls each data service's internal {@code DELETE
 * /internal/users/{id}} (server-to-server, X-Internal-Key) so a deleted user
 * leaves no financial data behind. Best-effort per target — one failure never
 * blocks the others or the identity deletion. Audit logs are intentionally
 * retained for compliance and are NOT a target here.
 */
@Component
public class UserDataPurgeClient {

    private static final Logger log = LoggerFactory.getLogger(UserDataPurgeClient.class);

    // Base URLs of services holding user data. Defaults to local dev ports.
    @Value("${purge.targets:http://localhost:8082,http://localhost:8083,http://localhost:8084,http://localhost:8085,http://localhost:8086,http://localhost:8087,http://localhost:8088}")
    private String targetsCsv;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    private final RestClient http = RestClient.create();

    public void purgeUser(Long userId) {
        for (String base : targetsCsv.split(",")) {
            String target = base.trim();
            if (target.isEmpty()) continue;
            try {
                http.delete()
                        .uri(target + "/internal/users/" + userId)
                        .header("X-Internal-Key", internalKey)
                        .retrieve()
                        .toBodilessEntity();
                log.info("purged user {} data at {}", userId, target);
            } catch (Exception e) {
                log.warn("purge failed for user {} at {}: {}", userId, target, e.getMessage());
            }
        }
    }
}
