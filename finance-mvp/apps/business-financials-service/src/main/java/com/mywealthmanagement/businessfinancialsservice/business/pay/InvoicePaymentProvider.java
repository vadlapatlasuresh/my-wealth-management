package com.mywealthmanagement.businessfinancialsservice.business.pay;

import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessInvoice;

/**
 * Accepts a customer "Pay Now" payment for an invoice (card / ACH / e-check). Abstracts the
 * processor so the flow works end-to-end with a {@link MockInvoicePaymentProvider} out of the
 * box and switches to real Stripe by config + keys ({@code payments.invoice.provider=stripe}).
 */
public interface InvoicePaymentProvider {

    /** A hosted-checkout handoff for one invoice payment. */
    record Checkout(String url, String ref, String provider) {}

    /**
     * Creates a hosted checkout for {@code inv} paid by {@code method} (CARD | ACH | ECHECK).
     * {@code publicBaseUrl} is the SPA origin used to build the success/return URL back to the
     * public invoice page. The returned {@code ref} identifies the attempt for later verify.
     */
    Checkout createCheckout(BusinessInvoice inv, String method, String publicBaseUrl);

    /** True once the processor confirms {@code ref} paid the invoice in full. */
    boolean verifyPaid(String ref, BusinessInvoice inv);

    /** Provider label shown to the caller (e.g. "mock", "stripe"). */
    String name();

    /** False for the mock/dev provider; true when a real processor + keys are configured. */
    boolean live();
}
