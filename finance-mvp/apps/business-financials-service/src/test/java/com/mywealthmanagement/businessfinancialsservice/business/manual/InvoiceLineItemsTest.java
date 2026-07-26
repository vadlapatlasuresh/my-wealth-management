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

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;

/**
 * Line-item money math on {@link ManualBusinessController}: subtotal from lines, then
 * discount (amount / percent, capped) and tax, producing the grand total stored in
 * {@code amount}. Verifies the derived total is authoritative (order-to-cash Phase 1.2).
 */
@ExtendWith(MockitoExtension.class)
class InvoiceLineItemsTest {

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
        ManualBusiness b = new ManualBusiness();
        b.setId(BIZ);
        b.setUserId(USER);
        lenient().when(businessRepo.findByIdAndUserId(BIZ, USER)).thenReturn(Optional.of(b));
        lenient().when(invoiceRepo.save(any(BusinessInvoice.class))).thenAnswer(inv -> {
            BusinessInvoice i = inv.getArgument(0);
            if (i.getId() == null) i.setId(500L);
            return i;
        });
        lenient().when(lineItemRepo.saveAll(any())).thenAnswer(inv -> {
            List<BusinessInvoiceLineItem> l = inv.getArgument(0);
            return l;
        });
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private Map<String, Object> line(String desc, String qty, String price) {
        Map<String, Object> m = new HashMap<>();
        m.put("description", desc);
        m.put("quantity", qty);
        m.put("unitPrice", price);
        return m;
    }

    @Test
    void lineItems_setSubtotalAndDeriveAmount() {
        Map<String, Object> body = new HashMap<>();
        body.put("customer", "Acme");
        body.put("lineItems", List.of(line("Design", "10", "100"), line("Hosting", "2", "25.50")));

        BusinessInvoice inv = controller.createInvoice(BIZ, body);

        assertThat(inv.getSubtotal()).isEqualByComparingTo("1051.00"); // 1000 + 51
        assertThat(inv.getAmount()).isEqualByComparingTo("1051.00");    // no discount/tax
        assertThat(inv.getLineItems()).hasSize(2);
        assertThat(inv.getLineItems().get(0).getAmount()).isEqualByComparingTo("1000.00");
        verify(lineItemRepo).deleteByInvoiceId(500L);
    }

    @Test
    void percentDiscountThenTax_computeGrandTotal() {
        Map<String, Object> body = new HashMap<>();
        body.put("customer", "Acme");
        body.put("lineItems", List.of(line("Work", "1", "1000")));
        body.put("discountType", "percent");
        body.put("discountValue", "10");     // 10% -> 100 off
        body.put("taxRate", "8.25");         // on 900 -> 74.25

        BusinessInvoice inv = controller.createInvoice(BIZ, body);

        assertThat(inv.getSubtotal()).isEqualByComparingTo("1000.00");
        assertThat(inv.getDiscountAmount()).isEqualByComparingTo("100.00");
        assertThat(inv.getTaxAmount()).isEqualByComparingTo("74.25");
        assertThat(inv.getAmount()).isEqualByComparingTo("974.25");
    }

    @Test
    void amountDiscount_neverPushesTotalBelowZero() {
        Map<String, Object> body = new HashMap<>();
        body.put("customer", "Acme");
        body.put("lineItems", List.of(line("Work", "1", "50")));
        body.put("discountType", "amount");
        body.put("discountValue", "200");    // exceeds subtotal -> capped at 50

        BusinessInvoice inv = controller.createInvoice(BIZ, body);

        assertThat(inv.getDiscountAmount()).isEqualByComparingTo("50.00");
        assertThat(inv.getAmount()).isEqualByComparingTo("0.00");
    }

    @Test
    void noLineItems_keepsDirectlyEnteredAmount() {
        Map<String, Object> body = new HashMap<>();
        body.put("customer", "Acme");
        body.put("amount", "425.00");

        BusinessInvoice inv = controller.createInvoice(BIZ, body);

        assertThat(inv.getAmount()).isEqualByComparingTo("425.00");
        assertThat(inv.getSubtotal()).isNull();
        assertThat(inv.getLineItems()).isNullOrEmpty();
    }
}
