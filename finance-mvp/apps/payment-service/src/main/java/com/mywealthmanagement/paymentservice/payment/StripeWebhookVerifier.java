package com.mywealthmanagement.paymentservice.payment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

/**
 * Verifies the {@code Stripe-Signature} header on incoming webhooks using Stripe's
 * documented scheme: HMAC-SHA256 over {@code "<timestamp>.<raw-body>"} keyed by the
 * endpoint's signing secret ({@code whsec_...}), with a timestamp-tolerance check to
 * defeat replay.
 * <p>
 * If no signing secret is configured the verifier accepts the request and logs a
 * warning — this keeps the mock/dev flow working. In production, set
 * {@code STRIPE_WEBHOOK_SECRET} and unsigned/forged webhooks are rejected.
 */
@Component
public class StripeWebhookVerifier {

    private static final Logger log = LoggerFactory.getLogger(StripeWebhookVerifier.class);

    private final String signingSecret;
    private final long toleranceSeconds;

    public StripeWebhookVerifier(
            @Value("${stripe.webhook-secret:}") String signingSecret,
            @Value("${stripe.webhook.tolerance-seconds:300}") long toleranceSeconds) {
        this.signingSecret = signingSecret;
        this.toleranceSeconds = toleranceSeconds;
    }

    /**
     * @param payload   the raw request body, exactly as received
     * @param sigHeader the value of the {@code Stripe-Signature} header
     * @return true if the signature is valid (or verification is disabled in dev)
     */
    public boolean verify(String payload, String sigHeader) {
        if (signingSecret == null || signingSecret.isBlank()) {
            log.warn("STRIPE_WEBHOOK_SECRET is not set — accepting webhook WITHOUT signature "
                    + "verification. Set it in production.");
            return true;
        }
        if (payload == null || sigHeader == null || sigHeader.isBlank()) {
            return false;
        }

        String timestamp = null;
        String expectedSig = null;
        for (String part : sigHeader.split(",")) {
            String[] kv = part.split("=", 2);
            if (kv.length != 2) {
                continue;
            }
            if ("t".equals(kv[0])) {
                timestamp = kv[1];
            } else if ("v1".equals(kv[0])) {
                expectedSig = kv[1];
            }
        }
        if (timestamp == null || expectedSig == null) {
            return false;
        }

        // Replay protection: reject signatures whose timestamp is outside tolerance.
        try {
            long ts = Long.parseLong(timestamp);
            long age = Math.abs(Instant.now().getEpochSecond() - ts);
            if (age > toleranceSeconds) {
                log.warn("Rejected Stripe webhook: timestamp outside tolerance ({}s).", age);
                return false;
            }
        } catch (NumberFormatException e) {
            return false;
        }

        String signedPayload = timestamp + "." + payload;
        String computed = hmacSha256Hex(signedPayload, signingSecret);
        // Constant-time comparison to avoid timing side-channels.
        return MessageDigest.isEqual(
                computed.getBytes(StandardCharsets.UTF_8),
                expectedSig.getBytes(StandardCharsets.UTF_8));
    }

    private String hmacSha256Hex(String data, String key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(raw.length * 2);
            for (byte b : raw) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Unable to compute HMAC", e);
        }
    }
}
