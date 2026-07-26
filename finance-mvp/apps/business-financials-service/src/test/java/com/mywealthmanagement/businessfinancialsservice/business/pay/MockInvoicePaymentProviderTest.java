package com.mywealthmanagement.businessfinancialsservice.business.pay;

import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessInvoice;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/** The mock Pay-Now provider: builds a return URL and only verifies refs it minted. */
class MockInvoicePaymentProviderTest {

    private final MockInvoicePaymentProvider provider = new MockInvoicePaymentProvider();

    private BusinessInvoice invoice() {
        BusinessInvoice inv = new BusinessInvoice();
        inv.setId(42L);
        inv.setShareToken("tok123");
        inv.setAmount(new BigDecimal("100.00"));
        return inv;
    }

    @Test
    void createCheckout_returnsReturnUrlWithRef() {
        BusinessInvoice inv = invoice();
        var c = provider.createCheckout(inv, "CARD", "https://app.example.com/");
        assertThat(c.provider()).isEqualTo("mock");
        assertThat(c.ref()).startsWith("MOCK-42-");
        assertThat(c.url()).isEqualTo("https://app.example.com/invoice/tok123?paid=" + c.ref());
        assertThat(provider.live()).isFalse();
    }

    @Test
    void verifyPaid_onlyAcceptsRefForThisInvoice() {
        BusinessInvoice inv = invoice();
        var c = provider.createCheckout(inv, "CARD", "https://x");
        assertThat(provider.verifyPaid(c.ref(), inv)).isTrue();
        assertThat(provider.verifyPaid("MOCK-99-abc", inv)).isFalse(); // different invoice
        assertThat(provider.verifyPaid(null, inv)).isFalse();
    }
}
