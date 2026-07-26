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
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Quotes/estimates + one-click convert-to-invoice (order-to-cash Phase 1.3): quote money
 * math matches invoices, convert copies the breakdown + line items into a real invoice and
 * stamps the quote CONVERTED, and re-converting is refused.
 */
@ExtendWith(MockitoExtension.class)
class QuoteConvertTest {

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
        lenient().when(quoteRepo.save(any(BusinessQuote.class))).thenAnswer(inv -> {
            BusinessQuote q = inv.getArgument(0);
            if (q.getId() == null) q.setId(900L);
            return q;
        });
        lenient().when(quoteLineItemRepo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(invoiceRepo.save(any(BusinessInvoice.class))).thenAnswer(inv -> {
            BusinessInvoice i = inv.getArgument(0);
            if (i.getId() == null) i.setId(600L);
            return i;
        });
        lenient().when(lineItemRepo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
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

    private BusinessQuote sampleQuote() {
        Map<String, Object> body = new HashMap<>();
        body.put("customer", "Acme");
        body.put("customerEmail", "ap@acme.com");
        body.put("lineItems", List.of(line("Build", "1", "1000"), line("Support", "2", "100")));
        body.put("taxRate", "10");
        return controller.createQuote(BIZ, body);
    }

    @Test
    void createQuote_computesTotalsLikeInvoice() {
        BusinessQuote q = sampleQuote();
        assertThat(q.getStatus()).isEqualTo("DRAFT");
        assertThat(q.getSubtotal()).isEqualByComparingTo("1200.00");
        assertThat(q.getTaxAmount()).isEqualByComparingTo("120.00");
        assertThat(q.getAmount()).isEqualByComparingTo("1320.00");
        assertThat(q.getLineItems()).hasSize(2);
    }

    @Test
    void convertQuote_createsInvoiceWithCopiedLinesAndStampsConverted() {
        BusinessQuote q = sampleQuote();
        when(quoteRepo.findByIdAndUserId(900L, USER)).thenReturn(Optional.of(q));
        // Two saved quote line items to copy.
        BusinessQuoteLineItem l1 = new BusinessQuoteLineItem();
        l1.setPosition(0); l1.setDescription("Build"); l1.setQuantity(new BigDecimal("1")); l1.setUnitPrice(new BigDecimal("1000")); l1.setAmount(new BigDecimal("1000.00"));
        BusinessQuoteLineItem l2 = new BusinessQuoteLineItem();
        l2.setPosition(1); l2.setDescription("Support"); l2.setQuantity(new BigDecimal("2")); l2.setUnitPrice(new BigDecimal("100")); l2.setAmount(new BigDecimal("200.00"));
        when(quoteLineItemRepo.findByQuoteIdOrderByPositionAsc(900L)).thenReturn(List.of(l1, l2));

        BusinessInvoice inv = controller.convertQuote(900L, Map.of("dueDate", "2026-09-01"));

        assertThat(inv.getCustomer()).isEqualTo("Acme");
        assertThat(inv.getStatus()).isEqualTo("OPEN");
        assertThat(inv.getAmount()).isEqualByComparingTo("1320.00");
        assertThat(inv.getTaxAmount()).isEqualByComparingTo("120.00");
        assertThat(inv.getLineItems()).hasSize(2);
        assertThat(inv.getLineItems().get(1).getDescription()).isEqualTo("Support");
        // Quote is stamped CONVERTED + linked to the new invoice.
        assertThat(q.getStatus()).isEqualTo("CONVERTED");
        assertThat(q.getConvertedInvoiceId()).isEqualTo(600L);
    }

    @Test
    void convertQuote_twiceIsRefused() {
        BusinessQuote q = new BusinessQuote();
        q.setId(901L);
        q.setUserId(USER);
        q.setBusinessId(BIZ);
        q.setStatus("CONVERTED");
        q.setConvertedInvoiceId(42L);
        when(quoteRepo.findByIdAndUserId(901L, USER)).thenReturn(Optional.of(q));

        assertThatThrownBy(() -> controller.convertQuote(901L, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already converted");
    }
}
