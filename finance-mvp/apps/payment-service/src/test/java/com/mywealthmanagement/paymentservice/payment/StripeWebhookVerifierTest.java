package com.mywealthmanagement.paymentservice.payment;

import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class StripeWebhookVerifierTest {

    private static final String SECRET = "whsec_test_secret";

    private String sign(String payload, long timestamp, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal((timestamp + "." + payload).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : raw) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return "t=" + timestamp + ",v1=" + hex;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void acceptsValidSignature() {
        StripeWebhookVerifier verifier = new StripeWebhookVerifier(SECRET, 300);
        String payload = "{\"id\":\"evt_1\",\"type\":\"payment_intent.succeeded\"}";
        String header = sign(payload, Instant.now().getEpochSecond(), SECRET);

        assertThat(verifier.verify(payload, header)).isTrue();
    }

    @Test
    void rejectsTamperedPayload() {
        StripeWebhookVerifier verifier = new StripeWebhookVerifier(SECRET, 300);
        String header = sign("{\"amount\":100}", Instant.now().getEpochSecond(), SECRET);

        assertThat(verifier.verify("{\"amount\":999999}", header)).isFalse();
    }

    @Test
    void rejectsWrongSecret() {
        StripeWebhookVerifier verifier = new StripeWebhookVerifier(SECRET, 300);
        String payload = "{\"id\":\"evt_1\"}";
        String header = sign(payload, Instant.now().getEpochSecond(), "whsec_attacker");

        assertThat(verifier.verify(payload, header)).isFalse();
    }

    @Test
    void rejectsStaleTimestamp() {
        StripeWebhookVerifier verifier = new StripeWebhookVerifier(SECRET, 300);
        String payload = "{\"id\":\"evt_1\"}";
        long stale = Instant.now().getEpochSecond() - 10_000;
        String header = sign(payload, stale, SECRET);

        assertThat(verifier.verify(payload, header)).isFalse();
    }

    @Test
    void acceptsWhenNoSecretConfigured_devMode() {
        StripeWebhookVerifier verifier = new StripeWebhookVerifier("", 300);
        assertThat(verifier.verify("{}", null)).isTrue();
    }
}
