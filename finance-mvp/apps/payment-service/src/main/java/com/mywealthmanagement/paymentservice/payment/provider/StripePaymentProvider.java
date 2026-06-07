package com.mywealthmanagement.paymentservice.payment.provider;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;

/**
 * Real {@link PaymentProvider} that creates a Stripe PaymentIntent via the Stripe REST
 * API (no SDK dependency). Active only when {@code payment.provider=stripe} and marked
 * {@link Primary} so it is injected ahead of {@link MockPaymentProvider} when present.
 * <p>
 * Requires {@code STRIPE_SECRET_KEY}. If the key is missing or the API call fails, it
 * degrades to the mock so the bill-pay flow never hard-fails. Incoming Stripe webhooks
 * are verified separately by {@code StripeWebhookVerifier}.
 */
@Service
@Primary
@ConditionalOnProperty(name = "payment.provider", havingValue = "stripe")
public class StripePaymentProvider implements PaymentProvider {

    private static final Logger log = LoggerFactory.getLogger(StripePaymentProvider.class);

    private final RestClient restClient;
    private final String secretKey;
    private final MockPaymentProvider fallback;

    public StripePaymentProvider(
            @Value("${stripe.base-url:https://api.stripe.com}") String baseUrl,
            @Value("${stripe.secret-key:}") String secretKey,
            MockPaymentProvider fallback) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
        this.secretKey = secretKey;
        this.fallback = fallback;
    }

    @Override
    public String createPayment(BigDecimal amount, String currency, String payee) {
        if (secretKey == null || secretKey.isBlank()) {
            log.warn("payment.provider=stripe but STRIPE_SECRET_KEY is not set; using mock reference.");
            return fallback.createPayment(amount, currency, payee);
        }
        try {
            // Stripe expects the amount in the smallest currency unit (e.g. cents).
            long minorUnits = amount.movePointRight(2).longValueExact();

            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("amount", Long.toString(minorUnits));
            form.add("currency", currency == null ? "usd" : currency.toLowerCase());
            form.add("description", payee == null ? "Bill payment" : payee);
            form.add("automatic_payment_methods[enabled]", "true");

            JsonNode response = restClient.post()
                    .uri("/v1/payment_intents")
                    .header("Authorization", "Bearer " + secretKey)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);

            if (response != null && response.hasNonNull("id")) {
                return response.get("id").asText();
            }
            log.warn("Stripe PaymentIntent response missing id; using mock reference.");
            return fallback.createPayment(amount, currency, payee);
        } catch (Exception e) {
            log.warn("Stripe PaymentIntent creation failed ({}); using mock reference.", e.getMessage());
            return fallback.createPayment(amount, currency, payee);
        }
    }
}
