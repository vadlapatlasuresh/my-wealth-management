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
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Unit coverage for the order-to-cash customer/contact logic on
 * {@link ManualBusinessController}: creation validation and the invoice snapshot
 * back-fill that keeps the public invoice stable independent of the saved customer.
 */
@ExtendWith(MockitoExtension.class)
class CustomerContactTest {

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
    @Mock private BusinessTaxRateRepository taxRateRepo;
    @Mock private BusinessSummaryService summaryService;
    @Mock private DocumentStorageService storageService;
    @Mock private NotificationClient notificationClient;
    @Mock private DocumentsRegistryClient documentsRegistryClient;
    @Mock private CommsClient commsClient;

    @InjectMocks private ManualBusinessController controller;

    @BeforeEach
    void auth() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(String.valueOf(USER), "n/a"));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void businessOwned() {
        ManualBusiness b = new ManualBusiness();
        b.setId(BIZ);
        b.setUserId(USER);
        b.setName("Acme LLC");
        lenient().when(businessRepo.findByIdAndUserId(BIZ, USER)).thenReturn(Optional.of(b));
    }

    @Test
    void createCustomer_derivesDisplayNameFromFirstLast_andPersists() {
        businessOwned();
        when(customerRepo.save(any(BusinessCustomer.class))).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> body = new HashMap<>();
        body.put("firstName", "Dana");
        body.put("lastName", "Reyes");
        body.put("preferredPaymentMethod", "ach");
        body.put("billingCountry", "usa");

        BusinessCustomer saved = controller.createCustomer(BIZ, body);

        assertThat(saved.getDisplayName()).isEqualTo("Dana Reyes");
        assertThat(saved.getUserId()).isEqualTo(USER);
        assertThat(saved.getBusinessId()).isEqualTo(BIZ);
        assertThat(saved.getPreferredPaymentMethod()).isEqualTo("ACH"); // upper-cased
        assertThat(saved.getBillingCountry()).isEqualTo("US");          // ISO alpha-2
    }

    @Test
    void createCustomer_rejectsBlankName() {
        businessOwned();
        assertThatThrownBy(() -> controller.createCustomer(BIZ, new HashMap<>()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("name is required");
    }

    @Test
    void createInvoice_withCustomerId_backfillsInlineSnapshotFromSavedCustomer() {
        businessOwned();
        BusinessCustomer c = new BusinessCustomer();
        c.setId(42L);
        c.setUserId(USER);
        c.setBusinessId(BIZ);
        c.setDisplayName("Acme Corp");
        c.setEmail("billing@acme.com");
        c.setMobile("+15551230000");
        when(customerRepo.findByIdAndBusinessIdAndUserId(42L, BIZ, USER)).thenReturn(Optional.of(c));
        when(invoiceRepo.save(any(BusinessInvoice.class))).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> body = new HashMap<>();
        body.put("customerId", 42);
        body.put("amount", "250.00");

        BusinessInvoice inv = controller.createInvoice(BIZ, body);

        assertThat(inv.getCustomerId()).isEqualTo(42L);
        assertThat(inv.getCustomer()).isEqualTo("Acme Corp");            // snapshot from customer
        assertThat(inv.getCustomerEmail()).isEqualTo("billing@acme.com");
        assertThat(inv.getCustomerPhone()).isEqualTo("+15551230000");    // mobile preferred
        assertThat(inv.getAmount()).isEqualByComparingTo(new BigDecimal("250.00"));
    }

    @Test
    void createInvoice_withUnknownCustomerId_isRejected() {
        businessOwned();
        when(customerRepo.findByIdAndBusinessIdAndUserId(99L, BIZ, USER)).thenReturn(Optional.empty());

        Map<String, Object> body = new HashMap<>();
        body.put("customerId", 99);
        body.put("amount", "10.00");

        assertThatThrownBy(() -> controller.createInvoice(BIZ, body))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unknown customer");
    }
}
