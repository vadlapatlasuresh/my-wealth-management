package com.mywealthmanagement.businessfinancialsservice.business.pay;

import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessInvoice;
import org.springframework.stereotype.Service;

/**
 * Default no-processor provider. Simulates a hosted checkout by sending the customer straight
 * back to the public invoice page with a {@code ?paid=MOCK-…} marker the SPA confirms — so the
 * whole Pay-Now → auto-reconcile flow is exercisable without any Stripe keys. Swapped for
 * {@link StripeInvoicePaymentProvider} when {@code payments.invoice.provider=stripe}.
 */
@Service
public class MockInvoicePaymentProvider implements InvoicePaymentProvider {

    @Override
    public Checkout createCheckout(BusinessInvoice inv, String method, String publicBaseUrl) {
        String ref = "MOCK-" + inv.getId() + "-" + Long.toHexString(System.nanoTime());
        String base = publicBaseUrl == null ? "" : publicBaseUrl.replaceAll("/+$", "");
        String url = base + "/invoice/" + inv.getShareToken() + "?paid=" + ref;
        return new Checkout(url, ref, "mock");
    }

    @Override
    public boolean verifyPaid(String ref, BusinessInvoice inv) {
        // The mock "processor" always succeeds for a ref it minted for this invoice.
        return ref != null && ref.startsWith("MOCK-" + inv.getId() + "-");
    }

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public boolean live() {
        return false;
    }
}
