package com.mywealthmanagement.paymentservice.payment.provider;

/**
 * Moves money back to a customer's real payment instrument.
 *
 * Separate from {@link PaymentProvider} because taking money and giving it back are different
 * capabilities with different failure modes — and because a refund is the one ops action that
 * reaches outside our own books.
 *
 * Follows the house pattern: a deterministic mock is the default bean, the real implementation is
 * {@code @Primary @ConditionalOnProperty(payment.provider=stripe)}. So the ops flow is fully
 * exercisable with no provider keys, and turning Stripe on is config, not code.
 */
public interface RefundProvider {

    /**
     * @param chargeRef    the provider's reference for the original charge, when known
     * @param amountCents  positive minor units to return
     * @param currency     ISO currency
     * @param idempotencyKey passed to the provider so a retry after a timeout cannot double-refund.
     *                       Providers dedupe on this; we also dedupe locally on the ledger.
     * @return the provider's refund reference
     * @throws RefundException when the provider refuses or is unreachable — the adjustment then
     *                         goes to FAILED with the reason, rather than silently looking executed
     */
    String refund(String chargeRef, long amountCents, String currency, String idempotencyKey);

    /** A refund the provider refused or could not confirm. */
    class RefundException extends RuntimeException {
        public RefundException(String message) {
            super(message);
        }

        public RefundException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
