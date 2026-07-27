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
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Vendor-bill payment + void status transitions and ledger hand-off (procure-to-pay 2a). */
@ExtendWith(MockitoExtension.class)
class BillApTest {

    private static final long USER = 1L;

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
        lenient().when(billRepo.save(any(BusinessBill.class))).thenAnswer(i -> i.getArgument(0));
    }

    private BusinessBill bill(String status, String amount) {
        BusinessBill b = new BusinessBill();
        b.setId(88L); b.setUserId(USER); b.setBusinessId(7L); b.setVendor("Supplier Co");
        b.setStatus(status); b.setAmount(new BigDecimal(amount));
        return b;
    }

    @Test
    void payBill_partialThenFull() {
        BusinessBill b = bill("OPEN", "500.00");
        when(billRepo.findByIdAndUserId(88L, USER)).thenReturn(Optional.of(b));

        controller.payBill(88L, new HashMap<>(Map.of("paidAmount", "200")));
        assertThat(b.getStatus()).isEqualTo("PARTIALLY_PAID");
        verify(ledgerPosting, never()).postBillPaid(any());

        controller.payBill(88L, new HashMap<>(Map.of("paidAmount", "500")));
        assertThat(b.getStatus()).isEqualTo("PAID");
        assertThat(b.getPaidAt()).isNotNull();
        verify(ledgerPosting).postBillPaid(b);
    }

    @Test
    void voidBill_unpaidOkPaidRefused() {
        BusinessBill open = bill("OPEN", "500.00");
        when(billRepo.findByIdAndUserId(88L, USER)).thenReturn(Optional.of(open));
        controller.voidBill(88L);
        assertThat(open.getStatus()).isEqualTo("VOID");
        verify(ledgerPosting).postBillVoided(open);

        BusinessBill paid = bill("PAID", "500.00");
        paid.setId(89L); paid.setPaidAmount(new BigDecimal("500.00"));
        when(billRepo.findByIdAndUserId(89L, USER)).thenReturn(Optional.of(paid));
        assertThatThrownBy(() -> controller.voidBill(89L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("can't be voided");
    }
}
