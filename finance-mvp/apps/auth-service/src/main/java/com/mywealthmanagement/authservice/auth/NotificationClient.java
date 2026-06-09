package com.mywealthmanagement.authservice.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Delivers one-time security codes (MFA login, email/phone verification) by calling
 * notification-service's internal OTP endpoint (server-to-server, X-Internal-Key).
 * Fire-and-forget: never blocks or breaks auth if notification-service is down — in
 * dev the code is also returned in the API response (devCode) so it stays testable.
 */
@Component
public class NotificationClient {

    private static final Logger log = LoggerFactory.getLogger(NotificationClient.class);

    @Value("${notification.uri:http://localhost:8088}")
    private String notificationUri;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    private final RestClient http = RestClient.create();

    /** channel = EMAIL | SMS; recipient = email or phone; purpose = login | email-verify | phone-verify. */
    public void sendOtp(String channel, String recipient, String code, String purpose) {
        if (recipient == null || recipient.isBlank()) return;
        try {
            http.post()
                    .uri(notificationUri + "/internal/comms/otp")
                    .header("X-Internal-Key", internalKey)
                    .body(Map.of("channel", channel, "recipient", recipient, "code", code, "purpose", purpose))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.debug("OTP delivery skipped ({} {}): {}", channel, purpose, e.getMessage());
        }
    }
}
