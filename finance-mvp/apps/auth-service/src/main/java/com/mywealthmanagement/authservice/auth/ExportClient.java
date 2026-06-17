package com.mywealthmanagement.authservice.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Aggregates a user's data across services for the GDPR data export
 * ({@code GET /api/v1/me/export}). Calls each data service's
 * {@code GET /internal/users/{id}/export} (X-Internal-Key, same targets as the
 * delete-cascade). Best-effort per target: a service without the endpoint (404)
 * or one that's down is skipped, never failing the whole export. As more services
 * add the export endpoint, they're automatically included.
 */
@Component
public class ExportClient {

    private static final Logger log = LoggerFactory.getLogger(ExportClient.class);

    @Value("${purge.targets:http://localhost:8082,http://localhost:8083,http://localhost:8084,http://localhost:8085,http://localhost:8086,http://localhost:8087,http://localhost:8088}")
    private String targetsCsv;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    private final RestClient http = RestClient.create();

    /** Returns {serviceName -> that service's data} for every target that has the export endpoint. */
    public Map<String, Object> exportUser(Long userId) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String base : targetsCsv.split(",")) {
            String target = base.trim();
            if (target.isEmpty()) continue;
            try {
                Map<?, ?> data = http.get()
                        .uri(target + "/internal/users/" + userId + "/export")
                        .header("X-Internal-Key", internalKey)
                        .retrieve()
                        .body(Map.class);
                if (data != null && !data.isEmpty()) {
                    out.put(serviceName(target), data);
                }
            } catch (Exception e) {
                log.debug("export: no data from {} ({})", target, e.getMessage());
            }
        }
        return out;
    }

    /** http://account-aggregation-service:8080 -> account-aggregation-service */
    private static String serviceName(String url) {
        String s = url.replaceFirst("^https?://", "");
        int slash = s.indexOf('/');
        if (slash > 0) s = s.substring(0, slash);
        int colon = s.indexOf(':');
        if (colon > 0) s = s.substring(0, colon);
        return s;
    }
}
