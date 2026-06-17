package com.mywealthmanagement.notificationservice.comms.provider;

import com.mywealthmanagement.notificationservice.comms.Channel;
import com.mywealthmanagement.notificationservice.comms.ChannelProvider;
import com.mywealthmanagement.notificationservice.comms.DeliveryResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Real EMAIL provider backed by the SendGrid v3 API. Selected when
 * {@code comms.provider.email=sendgrid}. Requires {@code SENDGRID_API_KEY} and
 * {@code SENDGRID_FROM}; if either is missing it returns a FAILED result (it never
 * pretends to have delivered).
 */
@Component
public class SendGridEmailProvider implements ChannelProvider {

    private static final Logger log = LoggerFactory.getLogger(SendGridEmailProvider.class);

    private final RestClient restClient;
    private final String apiKey;
    private final String fromEmail;

    public SendGridEmailProvider(
            @Value("${sendgrid.base-url:https://api.sendgrid.com}") String baseUrl,
            @Value("${sendgrid.api-key:}") String apiKey,
            @Value("${sendgrid.from:}") String fromEmail) {
        this.restClient = RestClient.builder().baseUrl(baseUrl)
                .requestFactory(com.mywealthmanagement.notificationservice.comms.HttpTimeouts.provider()).build();
        this.apiKey = apiKey;
        this.fromEmail = fromEmail;
    }

    @Override
    public Channel channel() {
        return Channel.EMAIL;
    }

    @Override
    public String name() {
        return "sendgrid";
    }

    @Override
    public DeliveryResult send(String recipient, String subject, String body, Map<String, Object> meta) {
        if (apiKey.isBlank() || fromEmail.isBlank()) {
            return DeliveryResult.failed(Channel.EMAIL,
                    "SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM missing)");
        }
        try {
            Map<String, Object> payload = Map.of(
                    "personalizations", List.of(Map.of("to", List.of(Map.of("email", recipient)))),
                    "from", Map.of("email", fromEmail),
                    "subject", subject == null ? "" : subject,
                    "content", List.of(Map.of("type", "text/plain", "value", body == null ? "" : body))
            );
            restClient.post()
                    .uri("/v3/mail/send")
                    .header("Authorization", "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
            String ref = "sendgrid-" + UUID.randomUUID();
            return DeliveryResult.sent(Channel.EMAIL, ref, "Email accepted by SendGrid");
        } catch (Exception e) {
            log.warn("SendGrid send failed: {}", e.getMessage());
            return DeliveryResult.failed(Channel.EMAIL, "SendGrid error: " + e.getMessage());
        }
    }
}
