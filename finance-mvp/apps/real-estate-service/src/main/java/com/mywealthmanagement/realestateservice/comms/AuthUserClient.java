package com.mywealthmanagement.realestateservice.comms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Resolves the set of all user ids from auth-service so the deal room can broadcast a new
 * marketplace deal to everyone. Server-to-server with the shared internal key. Best-effort:
 * returns an empty list if the lookup fails, so a broadcast simply reaches no one rather
 * than erroring.
 */
@Component
public class AuthUserClient {

    private static final Logger log = LoggerFactory.getLogger(AuthUserClient.class);

    private final RestClient http;
    private final String internalKey;

    public AuthUserClient(
            @Value("${service.auth.url:http://localhost:8081}") String authUrl,
            @Value("${audit.ingest.key:${internal.key:dev-internal-audit-key}}") String internalKey) {
        this.http = RestClient.builder().baseUrl(authUrl).build();
        this.internalKey = internalKey;
    }

    /** All user ids, or an empty list if they can't be resolved. */
    public List<Long> allUserIds() {
        try {
            Map<?, ?> res = http.get()
                    .uri("/internal/users/ids")
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .body(Map.class);
            Object ids = res == null ? null : res.get("ids");
            if (ids instanceof List<?> list) {
                return list.stream().map(o -> Long.valueOf(o.toString())).toList();
            }
            return List.of();
        } catch (Exception e) {
            log.warn("all-user-ids lookup failed: {}", e.getMessage());
            return List.of();
        }
    }
}
