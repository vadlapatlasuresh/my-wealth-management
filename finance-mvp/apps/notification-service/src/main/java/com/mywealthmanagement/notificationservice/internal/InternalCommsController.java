package com.mywealthmanagement.notificationservice.internal;

import com.mywealthmanagement.notificationservice.comms.Channel;
import com.mywealthmanagement.notificationservice.comms.ChannelProvider;
import com.mywealthmanagement.notificationservice.comms.ChannelRouter;
import com.mywealthmanagement.notificationservice.comms.DeliveryResult;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Server-to-server delivery of one-time security codes (MFA login, email/phone
 * verification). Called by auth-service (X-Internal-Key) BEFORE the user has a JWT,
 * so it can't go through the JWT-authenticated /notifications/send. Sends directly
 * via the channel's active provider — mock in dev, Twilio/SendGrid when keyed —
 * and deliberately bypasses templates/preferences/quiet-hours (security codes
 * must always send).
 */
@RestController
@RequestMapping("/internal/comms")
@RequiredArgsConstructor
public class InternalCommsController {

    private static final Logger log = LoggerFactory.getLogger(InternalCommsController.class);

    private final ChannelRouter router;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    @PostMapping("/otp")
    public ResponseEntity<Map<String, String>> sendOtp(@RequestBody Map<String, String> body,
                                                       @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        Channel channel = "SMS".equalsIgnoreCase(body.get("channel")) ? Channel.SMS : Channel.EMAIL;
        String recipient = body.get("recipient");
        String code = body.get("code");
        String purpose = body.getOrDefault("purpose", "verification");
        if (!StringUtils.hasText(recipient) || !StringUtils.hasText(code)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "recipient and code are required");
        }

        ChannelProvider provider = router.providerFor(channel);
        if (provider == null) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("status", "NO_PROVIDER"));
        }

        String subject = "Your TerraVest verification code";
        String message = "Your TerraVest " + label(purpose) + " code is " + code
                + ". It expires in 5 minutes. If you didn't request this, ignore this message.";
        try {
            DeliveryResult r = provider.send(recipient, subject, message,
                    Map.of("type", "otp", "purpose", purpose));
            return ResponseEntity.ok(Map.of(
                    "channel", channel.name(),
                    "provider", provider.name(),
                    "status", r != null && r.getStatus() != null ? r.getStatus().name() : "SENT"));
        } catch (Exception e) {
            log.warn("OTP delivery failed via {} {}: {}", provider.name(), channel, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("status", "FAILED"));
        }
    }

    private static String label(String purpose) {
        return switch (purpose) {
            case "login" -> "login";
            case "email-verify" -> "email verification";
            case "phone-verify" -> "phone verification";
            default -> "verification";
        };
    }
}
