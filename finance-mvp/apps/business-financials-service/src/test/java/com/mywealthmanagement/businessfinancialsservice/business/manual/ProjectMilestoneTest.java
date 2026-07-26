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
 * Progress / milestone invoicing (order-to-cash Phase 1.4b): a percent milestone sets its
 * amount from the contract, billing it materializes an invoice + marks it INVOICED, and
 * billed-to-date / remaining draw down against the contract total.
 */
@ExtendWith(MockitoExtension.class)
class ProjectMilestoneTest {

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
        ManualBusiness b = new ManualBusiness();
        b.setId(BIZ);
        b.setUserId(USER);
        lenient().when(businessRepo.findByIdAndUserId(BIZ, USER)).thenReturn(Optional.of(b));
        lenient().when(milestoneRepo.save(any(BusinessProjectMilestone.class))).thenAnswer(i -> i.getArgument(0));
        lenient().when(invoiceRepo.save(any(BusinessInvoice.class))).thenAnswer(i -> {
            BusinessInvoice v = i.getArgument(0);
            if (v.getId() == null) v.setId(700L);
            return v;
        });
        lenient().when(lineItemRepo.saveAll(any())).thenAnswer(i -> i.getArgument(0));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private BusinessProject project() {
        BusinessProject p = new BusinessProject();
        p.setId(20L);
        p.setUserId(USER);
        p.setBusinessId(BIZ);
        p.setCustomer("Acme");
        p.setName("Website build");
        p.setContractTotal(new BigDecimal("10000.00"));
        return p;
    }

    @Test
    void percentMilestone_setsAmountFromContract() {
        when(projectRepo.findByIdAndUserId(20L, USER)).thenReturn(Optional.of(project()));
        when(milestoneRepo.findByProjectIdOrderByPositionAsc(20L)).thenReturn(List.of());

        Map<String, Object> body = new HashMap<>();
        body.put("name", "Deposit");
        body.put("percent", "30");

        BusinessProjectMilestone m = controller.addMilestone(20L, body);

        assertThat(m.getAmount()).isEqualByComparingTo("3000.00"); // 30% of 10,000
        assertThat(m.getStatus()).isEqualTo("PENDING");
    }

    @Test
    void billMilestone_createsInvoiceAndMarksInvoiced() {
        BusinessProject p = project();
        BusinessProjectMilestone m = new BusinessProjectMilestone();
        m.setId(55L);
        m.setUserId(USER);
        m.setProjectId(20L);
        m.setName("Deposit");
        m.setAmount(new BigDecimal("3000.00"));
        m.setStatus("PENDING");
        when(milestoneRepo.findByIdAndUserId(55L, USER)).thenReturn(Optional.of(m));
        when(projectRepo.findByIdAndUserId(20L, USER)).thenReturn(Optional.of(p));

        BusinessInvoice inv = controller.billMilestone(55L, null);

        assertThat(inv.getCustomer()).isEqualTo("Acme");
        assertThat(inv.getStatus()).isEqualTo("OPEN");
        assertThat(inv.getAmount()).isEqualByComparingTo("3000.00");
        assertThat(inv.getLineItems()).hasSize(1);
        assertThat(inv.getLineItems().get(0).getDescription()).isEqualTo("Website build — Deposit");
        assertThat(m.getStatus()).isEqualTo("INVOICED");
        assertThat(m.getInvoiceId()).isEqualTo(700L);
    }

    @Test
    void billMilestone_twiceIsRefused() {
        BusinessProjectMilestone m = new BusinessProjectMilestone();
        m.setId(56L);
        m.setUserId(USER);
        m.setProjectId(20L);
        m.setStatus("INVOICED");
        m.setInvoiceId(700L);
        when(milestoneRepo.findByIdAndUserId(56L, USER)).thenReturn(Optional.of(m));

        assertThatThrownBy(() -> controller.billMilestone(56L, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already been billed");
    }

    @Test
    void updateProject_computesBilledToDateAndRemaining() {
        BusinessProject p = project();
        BusinessProjectMilestone billed = new BusinessProjectMilestone();
        billed.setStatus("INVOICED");
        billed.setAmount(new BigDecimal("3000.00"));
        BusinessProjectMilestone pending = new BusinessProjectMilestone();
        pending.setStatus("PENDING");
        pending.setAmount(new BigDecimal("7000.00"));
        when(projectRepo.findByIdAndUserId(20L, USER)).thenReturn(Optional.of(p));
        when(projectRepo.save(any(BusinessProject.class))).thenAnswer(i -> i.getArgument(0));
        when(milestoneRepo.findByProjectIdOrderByPositionAsc(20L)).thenReturn(List.of(billed, pending));

        BusinessProject reloaded = controller.updateProject(20L, new HashMap<>());

        assertThat(reloaded.getBilledToDate()).isEqualByComparingTo("3000.00");
        assertThat(reloaded.getRemaining()).isEqualByComparingTo("7000.00"); // 10,000 − 3,000
    }
}
