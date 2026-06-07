package com.mywealthmanagement.paymentservice.payment.provider;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;

/**
 * Mock implementation of {@link PaymentProvider} that simulates a Stripe-like
 * payment provider without making any network calls.
 *
 * A real implementation would create a Stripe PaymentIntent using the Stripe SDK
 * and the following configuration keys (currently not wired up):
 *
 * TODO: configure the following keys and replace this mock with a real Stripe client.
 *   STRIPE_SECRET_KEY      - secret API key used to authenticate with the Stripe API
 *   STRIPE_WEBHOOK_SECRET  - signing secret used to verify incoming webhook signatures
 *
 * e.g. (pseudo-code for a real impl):
 *   Stripe.apiKey = STRIPE_SECRET_KEY;
 *   PaymentIntent intent = PaymentIntent.create(params);
 *   return intent.getId();
 */
@Service
public class MockPaymentProvider implements PaymentProvider {

    @Override
    public String createPayment(BigDecimal amount, String currency, String payee) {
        // No network call: generate a deterministic-ish reference using System.nanoTime().
        return "pi_mock_" + System.nanoTime();
    }
}
