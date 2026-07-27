package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.business.storage.DocumentStorageService;
import com.mywealthmanagement.businessfinancialsservice.comms.CommsClient;
import com.mywealthmanagement.businessfinancialsservice.comms.DocumentsRegistryClient;
import com.mywealthmanagement.businessfinancialsservice.comms.NotificationClient;
import com.mywealthmanagement.businessfinancialsservice.ledger.LedgerPostingService;
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
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** PO → Bill conversion (procure-to-pay 2b): creates a bill, posts it, stamps CONVERTED. */
@ExtendWith(MockitoExtension.class)
class PurchaseOrderConvertTest {

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
    @Mock private BusinessTaxRateRepository taxRateRepo;
    @Mock private BusinessBillRepository billRepo;
    @Mock private BusinessPurchaseOrderRepository poRepo;
    @Mock private BusinessReminderSettingsRepository reminderSettingsRepo;
    @Mock private com.mywealthmanagement.businessfinancialsservice.business.dunning.DunningReminderService dunningService;
    @Mock private com.mywealthmanagement.businessfinancialsservice.business.pay.InvoicePaymentProvider paymentProvider;
    @Mock private LedgerPostingService ledgerPosting;
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
        lenient().when(billRepo.save(any(BusinessBill.class))).thenAnswer(i -> {
            BusinessBill b = i.getArgument(0);
            if (b.getId() == null) b.setId(900L);
            return b;
        });
        lenient().when(poRepo.save(any(BusinessPurchaseOrder.class))).thenAnswer(i -> i.getArgument(0));
    }

    private BusinessPurchaseOrder po(String status) {
        BusinessPurchaseOrder p = new BusinessPurchaseOrder();
        p.setId(50L); p.setUserId(USER); p.setBusinessId(BIZ); p.setVendor("Acme Supply");
        p.setPoNumber("PO-1"); p.setExpenseCategory("Operating Expenses");
        p.setAmount(new BigDecimal("1200.00")); p.setStatus(status);
        return p;
    }

    @Test
    void convert_createsBillPostsAndStampsConverted() {
        BusinessPurchaseOrder p = po("APPROVED");
        when(poRepo.findByIdAndUserId(50L, USER)).thenReturn(Optional.of(p));

        BusinessBill bill = controller.convertPurchaseOrder(50L, Map.of("dueDate", "2026-09-01"));

        assertThat(bill.getVendor()).isEqualTo("Acme Supply");
        assertThat(bill.getStatus()).isEqualTo("OPEN");
        assertThat(bill.getAmount()).isEqualByComparingTo("1200.00");
        assertThat(bill.getNotes()).contains("From PO");
        verify(ledgerPosting).postBillEntered(bill);
        assertThat(p.getStatus()).isEqualTo("CONVERTED");
        assertThat(p.getConvertedBillId()).isEqualTo(900L);
    }

    @Test
    void convert_twiceIsRefused() {
        BusinessPurchaseOrder p = po("CONVERTED");
        p.setConvertedBillId(900L);
        when(poRepo.findByIdAndUserId(50L, USER)).thenReturn(Optional.of(p));

        assertThatThrownBy(() -> controller.convertPurchaseOrder(50L, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already converted");
    }
}
