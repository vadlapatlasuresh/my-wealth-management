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

    /**
     * Generic server-to-server transactional send to an EXPLICIT recipient — used to
     * email/text people who aren't app users (a CPA on a document share, a customer on
     * an invoice). Body: { channel: EMAIL|SMS, recipient, subject?, body }. Bypasses
     * templates/preferences like the OTP path. Returns the provider + delivery status;
     * when SMS has no live provider it returns NO_PROVIDER so the caller can fall back
     * to a copyable message instead of failing.
     */
    @PostMapping("/message")
    public ResponseEntity<Map<String, String>> sendMessage(@RequestBody Map<String, String> body,
                                                           @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        Channel channel = "SMS".equalsIgnoreCase(body.get("channel")) ? Channel.SMS : Channel.EMAIL;
        String recipient = body.get("recipient");
        String message = body.get("body");
        String subject = body.getOrDefault("subject", "A message from TerraVest");
        if (!StringUtils.hasText(recipient) || !StringUtils.hasText(message)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "recipient and body are required");
        }
        ChannelProvider provider = router.providerFor(channel);
        if (provider == null || provider.name() == null || provider.name().toLowerCase().contains("mock")) {
            // No live provider (esp. SMS without Twilio): tell the caller so it can fall
            // back to showing the owner a copyable message.
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "channel", channel.name(),
                    "status", "NO_PROVIDER"));
        }
        try {
            DeliveryResult r = provider.send(recipient, subject, message, Map.of("type", "transactional"));
            return ResponseEntity.ok(Map.of(
                    "channel", channel.name(),
                    "provider", provider.name(),
                    "status", r != null && r.getStatus() != null ? r.getStatus().name() : "SENT"));
        } catch (Exception e) {
            log.warn("transactional {} delivery to {} failed: {}", channel, recipient, e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of(
                    "channel", channel.name(), "status", "FAILED"));
        }
    }

    private static String label(String purpose) {
        return switch (purpose) {
            case "login" -> "login";
            case "email-verify" -> "email verification";
            case "phone-verify" -> "phone verification";
            case "password-reset" -> "password reset";
            default -> "verification";
        };
    }
}
