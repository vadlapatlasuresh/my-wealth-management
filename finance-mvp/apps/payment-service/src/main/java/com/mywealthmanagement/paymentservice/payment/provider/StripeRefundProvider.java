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
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

/**
 * Real {@link RefundProvider}, via the Stripe REST API (no SDK dependency). Active only when
 * {@code payment.provider=stripe}, {@link Primary} so it wins over {@link MockRefundProvider}.
 *
 * IT DOES NOT FALL BACK TO THE MOCK — deliberately, and unlike {@link StripePaymentProvider}.
 * Degrading a failed *charge* to a mock reference costs us a bill-pay that didn't happen, which is
 * recoverable and visible. Degrading a failed *refund* would mark a customer's money as returned
 * when it never moved: the ledger would say EXECUTED, the audit trail would agree, the customer
 * would still be out of pocket, and nothing in our own records would ever contradict that. A
 * refund that cannot be confirmed must fail loudly and leave the adjustment FAILED, so a human
 * picks it up.
 *
 * Stripe's Idempotency-Key header carries our adjustment-derived key, so a retry after a timeout
 * returns the ORIGINAL refund rather than issuing a second one.
 */
@Service
@Primary
@ConditionalOnProperty(name = "payment.provider", havingValue = "stripe")
public class StripeRefundProvider implements RefundProvider {

    private static final Logger log = LoggerFactory.getLogger(StripeRefundProvider.class);

    private final RestClient restClient;
    private final String secretKey;

    public StripeRefundProvider(
            @Value("${stripe.base-url:https://api.stripe.com}") String baseUrl,
            @Value("${stripe.secret-key:}") String secretKey) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
        this.secretKey = secretKey;
    }

    @Override
    public String refund(String chargeRef, long amountCents, String currency, String idempotencyKey) {
        if (!StringUtils.hasText(secretKey)) {
            throw new RefundException("payment.provider=stripe but STRIPE_SECRET_KEY is not set — "
                    + "refusing to record a refund that cannot have happened.");
        }
        if (!StringUtils.hasText(chargeRef)) {
            throw new RefundException("No provider charge reference on this customer's ledger to refund "
                    + "against. Issue a CREDIT instead, or reconcile the charge first.");
        }

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("charge", chargeRef);
        form.add("amount", String.valueOf(amountCents));

        try {
            JsonNode response = restClient.post()
                    .uri("/v1/refunds")
                    .header("Authorization", "Bearer " + secretKey)
                    // Stripe dedupes on this: a retry returns the original refund, never a second.
                    .header("Idempotency-Key", idempotencyKey)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);

            String refundId = response == null ? null : response.path("id").asText(null);
            if (!StringUtils.hasText(refundId)) {
                throw new RefundException("Stripe accepted the refund but returned no id — "
                        + "treating as unconfirmed rather than assuming success.");
            }
            log.info("[StripeRefundProvider] refunded {} {} against charge {} -> {}",
                    amountCents, currency, chargeRef, refundId);
            return refundId;
        } catch (RefundException e) {
            throw e;
        } catch (Exception e) {
            // No fallback. See the class javadoc: an unconfirmed refund must not look executed.
            throw new RefundException("Stripe refund failed: " + e.getMessage(), e);
        }
    }
}
