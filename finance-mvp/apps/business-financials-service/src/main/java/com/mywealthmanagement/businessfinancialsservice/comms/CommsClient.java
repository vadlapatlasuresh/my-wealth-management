package com.mywealthmanagement.businessfinancialsservice.comms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.Map;

/**
 * Sends a transactional email/SMS to an EXPLICIT recipient (an invoice customer) via
 * notification-service's generic internal endpoint ({@code POST /internal/comms/message},
 * shared X-Internal-Key). Returns the delivery status so the caller can fall back to a
 * copyable message when SMS has no live provider. Short timeouts, best-effort.
 */
@Component
public class CommsClient {

    private static final Logger log = LoggerFactory.getLogger(CommsClient.class);

    private final RestClient restClient;
    private final String internalKey;
    private final boolean enabled;

    public CommsClient(
            @Value("${service.notification.url:http://localhost:8088}") String notificationUrl,
            @Value("${comms.internal.key:${AUDIT_INGEST_KEY:dev-internal-audit-key}}") String internalKey,
            @Value("${comms.enabled:true}") boolean enabled) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(5000);
        this.restClient = RestClient.builder().baseUrl(notificationUrl).requestFactory(factory).build();
        this.internalKey = internalKey;
        this.enabled = enabled;
    }

    /** Send email/SMS. Returns "SENT" | "NO_PROVIDER" | "FAILED" | "DISABLED". */
    public String send(String channel, String recipient, String subject, String body) {
        if (!enabled || recipient == null || recipient.isBlank()) {
            return "DISABLED";
        }
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("channel", channel);
            payload.put("recipient", recipient);
            payload.put("subject", subject);
            payload.put("body", body);
            Map<?, ?> res = restClient.post()
                    .uri("/internal/comms/message")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(Map.class);
            Object status = res == null ? null : res.get("status");
            return status == null ? "SENT" : String.valueOf(status);
        } catch (org.springframework.web.client.RestClientResponseException e) {
            try {
                Map<?, ?> res = new com.fasterxml.jackson.databind.ObjectMapper()
                        .readValue(e.getResponseBodyAsString(), Map.class);
                Object status = res.get("status");
                if (status != null) return String.valueOf(status);
            } catch (Exception ignored) { /* fall through */ }
            log.warn("comms send ({}) to {} failed: {}", channel, recipient, e.getMessage());
            return "FAILED";
        } catch (Exception e) {
            log.warn("comms send ({}) to {} failed: {}", channel, recipient, e.getMessage());
            return "FAILED";
        }
    }
}
