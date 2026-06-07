package com.mywealthmanagement.notificationservice.comms.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.mywealthmanagement.notificationservice.comms.Channel;
import com.mywealthmanagement.notificationservice.comms.ChannelProvider;
import com.mywealthmanagement.notificationservice.comms.DeliveryResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.UUID;

/**
 * PUSH provider backed by Firebase Cloud Messaging (legacy HTTP server-key endpoint).
 * Selected when {@code comms.provider.push=fcm}. Requires {@code FCM_SERVER_KEY}; the
 * {@code recipient} is the device registration token.
 * <p>
 * NOTE: This uses FCM's legacy {@code /fcm/send} endpoint, which is simple and real but
 * being phased out. The production follow-up is the HTTP v1 API, which requires an OAuth2
 * access token minted from a Google service account. Until that is wired, this provider
 * works with a server key and returns FAILED (never a false "sent") when unconfigured.
 */
@Component
public class FcmPushProvider implements ChannelProvider {

    private static final Logger log = LoggerFactory.getLogger(FcmPushProvider.class);

    private final RestClient restClient;
    private final String serverKey;

    public FcmPushProvider(
            @Value("${fcm.base-url:https://fcm.googleapis.com}") String baseUrl,
            @Value("${fcm.server-key:}") String serverKey) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
        this.serverKey = serverKey;
    }

    @Override
    public Channel channel() {
        return Channel.PUSH;
    }

    @Override
    public String name() {
        return "fcm";
    }

    @Override
    public DeliveryResult send(String recipient, String subject, String body, Map<String, Object> meta) {
        if (serverKey.isBlank()) {
            return DeliveryResult.failed(Channel.PUSH, "FCM not configured (FCM_SERVER_KEY missing)");
        }
        try {
            Map<String, Object> payload = Map.of(
                    "to", recipient,
                    "notification", Map.of(
                            "title", subject == null ? "" : subject,
                            "body", body == null ? "" : body)
            );
            JsonNode response = restClient.post()
                    .uri("/fcm/send")
                    .header("Authorization", "key=" + serverKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(JsonNode.class);

            String ref = (response != null && response.hasNonNull("multicast_id"))
                    ? response.get("multicast_id").asText() : "fcm-" + UUID.randomUUID();
            return DeliveryResult.sent(Channel.PUSH, ref, "Push accepted by FCM");
        } catch (Exception e) {
            log.warn("FCM send failed: {}", e.getMessage());
            return DeliveryResult.failed(Channel.PUSH, "FCM error: " + e.getMessage());
        }
    }
}
