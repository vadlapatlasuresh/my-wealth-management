package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.business.storage.DocumentStorageService;
import com.mywealthmanagement.businessfinancialsservice.comms.CommsClient;
import com.mywealthmanagement.businessfinancialsservice.comms.DocumentsRegistryClient;
import com.mywealthmanagement.businessfinancialsservice.comms.NotificationClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
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
 * Invoice lifecycle transitions (order-to-cash Phase 1.5): send → SENT, the public "viewed"
 * beacon → VIEWED, partial vs full payment, and void (with the paid-invoice guard).
 */
@ExtendWith(MockitoExtension.class)
class InvoiceLifecycleTest {

    private static final long USER = 1L;
    private static final long BIZ = 7L;

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
    @Mock private BusinessSummaryService summaryService;
    @Mock private DocumentStorageService storageService;
    @Mock private NotificationClient notificationClient;
    @Mock private DocumentsRegistryClient documentsRegistryClient;
    @Mock private CommsClient commsClient;

    @InjectMocks private ManualBusinessController controller;

    @BeforeEach
    void setup() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(String.valueOf(USER), "n/a"));
        lenient().when(invoiceRepo.save(any(BusinessInvoice.class))).thenAnswer(i -> i.getArgument(0));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private BusinessInvoice invoice(String status, String amount) {
        BusinessInvoice inv = new BusinessInvoice();
        inv.setId(500L);
        inv.setUserId(USER);
        inv.setBusinessId(BIZ);
        inv.setCustomer("Acme");
        inv.setCustomerEmail("ap@acme.com");
        inv.setStatus(status);
        inv.setAmount(new BigDecimal(amount));
        return inv;
    }

    @Test
    void send_movesDraftToSent() {
        BusinessInvoice inv = invoice("DRAFT", "1000");
        when(invoiceRepo.findByIdAndUserId(500L, USER)).thenReturn(Optional.of(inv));
        when(businessRepo.findByIdAndUserId(BIZ, USER)).thenReturn(Optional.of(new ManualBusiness()));
        when(commsClient.send(anyString(), anyString(), anyString(), anyString())).thenReturn("SENT");

        controller.sendInvoice(500L, new HashMap<>(Map.of("channel", "EMAIL")));

        assertThat(inv.getStatus()).isEqualTo("SENT");
        assertThat(inv.getSentAt()).isNotNull();
        assertThat(inv.getShareToken()).isNotNull();
    }

    @Test
    void viewedBeacon_setsViewedAtAndStatus() {
        BusinessInvoice inv = invoice("SENT", "1000");
        when(invoiceRepo.findByShareToken("tok")).thenReturn(Optional.of(inv));

        controller.markViewed("tok");

        assertThat(inv.getViewedAt()).isNotNull();
        assertThat(inv.getStatus()).isEqualTo("VIEWED");
    }

    @Test
    void viewedBeacon_doesNotDowngradePaid() {
        BusinessInvoice inv = invoice("PAID", "1000");
        when(invoiceRepo.findByShareToken("tok")).thenReturn(Optional.of(inv));

        controller.markViewed("tok");

        assertThat(inv.getStatus()).isEqualTo("PAID"); // unchanged
    }

    @Test
    void payment_partialThenFull() {
        BusinessInvoice inv = invoice("SENT", "1000");
        when(invoiceRepo.findByIdAndUserId(500L, USER)).thenReturn(Optional.of(inv));

        controller.recordPayment(500L, new HashMap<>(Map.of("paidAmount", "400")));
        assertThat(inv.getStatus()).isEqualTo("PARTIALLY_PAID");
        assertThat(inv.getPaidAt()).isNull();

        controller.recordPayment(500L, new HashMap<>(Map.of("paidAmount", "1000")));
        assertThat(inv.getStatus()).isEqualTo("PAID");
        assertThat(inv.getPaidAt()).isNotNull();
    }

    @Test
    void void_cancelsUnpaidButRefusesPaid() {
        BusinessInvoice open = invoice("SENT", "1000");
        when(invoiceRepo.findByIdAndUserId(500L, USER)).thenReturn(Optional.of(open));
        controller.voidInvoice(500L);
        assertThat(open.getStatus()).isEqualTo("VOID");

        BusinessInvoice paid = invoice("PAID", "1000");
        paid.setId(501L);
        paid.setPaidAmount(new BigDecimal("1000"));
        when(invoiceRepo.findByIdAndUserId(501L, USER)).thenReturn(Optional.of(paid));
        assertThatThrownBy(() -> controller.voidInvoice(501L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("can't be voided");
    }
}
