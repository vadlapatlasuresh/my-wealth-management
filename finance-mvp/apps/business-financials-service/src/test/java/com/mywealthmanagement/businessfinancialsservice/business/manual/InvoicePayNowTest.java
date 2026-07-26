package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.business.pay.InvoicePaymentProvider;
import com.mywealthmanagement.businessfinancialsservice.business.storage.DocumentStorageService;
import com.mywealthmanagement.businessfinancialsservice.comms.CommsClient;
import com.mywealthmanagement.businessfinancialsservice.comms.DocumentsRegistryClient;
import com.mywealthmanagement.businessfinancialsservice.comms.NotificationClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * "Pay Now" endpoints (order-to-cash Phase 1.6): start returns the hosted-checkout handoff,
 * and confirm auto-reconciles — marking the invoice PAID + recording the payment — only when
 * the provider verifies the attempt.
 */
@ExtendWith(MockitoExtension.class)
class InvoicePayNowTest {

    @Mock private ManualBusinessRepository businessRepo;
    @Mock private BusinessAccountRepository accountRepo;
    @Mock private BusinessTransactionRepository transactionRepo;
    @Mock private BusinessInvoiceRepository invoiceRepo;
    @Mock private ReconciledTransactionRepository reconciledRepo;
    @Mock private TransactionOverrideRepository overrideRepo;
    @Mock private BusinessLinkedAccountRepository linkedRepo;
    @Mock private BusinessDocumentRepository documentRepo;
    @Mock private BusinessBudgetRepository budgetRepo;
    @Mock private BusinessGoalRepository goalRepo;
    @Mock private BusinessVendorRepository vendorRepo;
    @Mock private BusinessExpenseRepository expenseRepo;
    @Mock private BusinessExpenseLinkRepository expenseLinkRepo;
    @Mock private BusinessCustomerRepository customerRepo;
    @Mock private BusinessInvoiceLineItemRepository lineItemRepo;
    @Mock private BusinessQuoteRepository quoteRepo;
    @Mock private BusinessQuoteLineItemRepository quoteLineItemRepo;
    @Mock private BusinessRecurringInvoiceRepository recurringRepo;
    @Mock private BusinessRecurringInvoiceItemRepository recurringItemRepo;
    @Mock private com.mywealthmanagement.businessfinancialsservice.business.recurring.RecurringInvoiceService recurringService;
    @Mock private BusinessProjectRepository projectRepo;
    @Mock private BusinessProjectMilestoneRepository milestoneRepo;
    @Mock private InvoicePaymentProvider paymentProvider;
    @Mock private BusinessSummaryService summaryService;
    @Mock private DocumentStorageService storageService;
    @Mock private NotificationClient notificationClient;
    @Mock private DocumentsRegistryClient documentsRegistryClient;
    @Mock private CommsClient commsClient;

    @InjectMocks private ManualBusinessController controller;

    @BeforeEach
    void setup() {
        lenient().when(invoiceRepo.save(any(BusinessInvoice.class))).thenAnswer(i -> i.getArgument(0));
    }

    private BusinessInvoice invoice(String status) {
        BusinessInvoice inv = new BusinessInvoice();
        inv.setId(42L);
        inv.setUserId(1L);
        inv.setShareToken("tok");
        inv.setCustomer("Acme");
        inv.setStatus(status);
        inv.setAmount(new BigDecimal("500.00"));
        return inv;
    }

    @Test
    void start_returnsCheckoutHandoff() {
        BusinessInvoice inv = invoice("SENT");
        when(invoiceRepo.findByShareToken("tok")).thenReturn(Optional.of(inv));
        when(paymentProvider.createCheckout(any(), anyString(), anyString()))
                .thenReturn(new InvoicePaymentProvider.Checkout("https://pay/x", "REF1", "mock"));
        when(paymentProvider.live()).thenReturn(false);

        Map<String, Object> out = controller.startInvoicePayment("tok", new HashMap<>(Map.of("method", "ach")));

        assertThat(out.get("checkoutUrl")).isEqualTo("https://pay/x");
        assertThat(out.get("provider")).isEqualTo("mock");
        assertThat(out.get("method")).isEqualTo("ACH");
        assertThat(out.get("live")).isEqualTo(false);
    }

    @Test
    void start_refusesAlreadyPaid() {
        when(invoiceRepo.findByShareToken("tok")).thenReturn(Optional.of(invoice("PAID")));
        assertThatThrownBy(() -> controller.startInvoicePayment("tok", null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already paid");
    }

    @Test
    void confirm_marksPaidWhenProviderVerifies() {
        BusinessInvoice inv = invoice("VIEWED");
        when(invoiceRepo.findByShareToken("tok")).thenReturn(Optional.of(inv));
        when(paymentProvider.verifyPaid("REF1", inv)).thenReturn(true);

        Map<String, Object> out = controller.confirmInvoicePayment("tok",
                new HashMap<>(Map.of("ref", "REF1", "method", "card")));

        assertThat(out.get("paid")).isEqualTo(true);
        assertThat(inv.getStatus()).isEqualTo("PAID");
        assertThat(inv.getPaidAmount()).isEqualByComparingTo("500.00");
        assertThat(inv.getPaymentReference()).isEqualTo("REF1");
        assertThat(inv.getPaymentMethod()).isEqualTo("Card");
        assertThat(inv.getPaidAt()).isNotNull();
    }

    @Test
    void confirm_doesNothingWhenNotVerified() {
        BusinessInvoice inv = invoice("VIEWED");
        when(invoiceRepo.findByShareToken("tok")).thenReturn(Optional.of(inv));
        when(paymentProvider.verifyPaid("BAD", inv)).thenReturn(false);

        Map<String, Object> out = controller.confirmInvoicePayment("tok", new HashMap<>(Map.of("ref", "BAD")));

        assertThat(out.get("paid")).isEqualTo(false);
        assertThat(inv.getStatus()).isEqualTo("VIEWED"); // unchanged
    }
}
