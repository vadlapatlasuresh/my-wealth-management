package com.mywealthmanagement.paymentservice.payment.provider;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Default {@link RefundProvider}: no network call, deterministic reference.
 *
 * The whole ops refund flow — propose, approve, execute, ledger, audit — is exercisable with no
 * Stripe keys. Set {@code payment.provider=stripe} to swap in {@link StripeRefundProvider}.
 *
 * It logs loudly. A mock refund leaves a real ledger entry and a real audit trail; the one thing it
 * does NOT do is move money. Anyone reading the logs of an environment where a customer expected
 * their money back should be able to see that immediately.
 */
@Service
public class MockRefundProvider implements RefundProvider {

    private static final Logger log = LoggerFactory.getLogger(MockRefundProvider.class);

    @Override
    public String refund(String chargeRef, long amountCents, String currency, String idempotencyKey) {
        log.warn("[MockRefundProvider] NO MONEY MOVED — simulated refund of {} {} against charge {} "
                        + "(idempotencyKey={}). Set payment.provider=stripe with real keys to actually refund.",
                amountCents, currency, chargeRef == null ? "<none>" : chargeRef, idempotencyKey);
        return "re_mock_" + idempotencyKey;
    }
}
