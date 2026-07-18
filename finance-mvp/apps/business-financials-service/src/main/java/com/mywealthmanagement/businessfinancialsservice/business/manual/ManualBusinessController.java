package com.mywealthmanagement.businessfinancialsservice.business.manual;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * CRUD for user-entered businesses and their accounts. Backs MyBusinessPage,
 * replacing its previous browser-localStorage storage with real persistence.
 */
@RestController
@RequestMapping("/api/v1/business/manual")
@RequiredArgsConstructor
public class ManualBusinessController {

    private final ManualBusinessRepository businessRepo;
    private final BusinessAccountRepository accountRepo;
    private final BusinessTransactionRepository transactionRepo;
    private final BusinessInvoiceRepository invoiceRepo;
    private final ReconciledTransactionRepository reconciledRepo;
    private final TransactionOverrideRepository overrideRepo;
    private final BusinessLinkedAccountRepository linkedRepo;
    private final BusinessDocumentRepository documentRepo;
    private final BusinessBudgetRepository budgetRepo;
    private final BusinessGoalRepository goalRepo;
    private final BusinessVendorRepository vendorRepo;
    private final BusinessExpenseRepository expenseRepo;
    private final BusinessExpenseLinkRepository expenseLinkRepo;
    private final BusinessSummaryService summaryService;
    private final com.mywealthmanagement.businessfinancialsservice.business.storage.DocumentStorageService storageService;
    private final com.mywealthmanagement.businessfinancialsservice.comms.NotificationClient notificationClient;
    private final com.mywealthmanagement.businessfinancialsservice.comms.DocumentsRegistryClient documentsRegistryClient;
    private final com.mywealthmanagement.businessfinancialsservice.comms.CommsClient commsClient;

    @org.springframework.beans.factory.annotation.Value("${app.web-url:http://localhost:5173}")
    private String webUrl;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /* ---------------- Businesses ---------------- */

    @GetMapping("/businesses")
    public List<ManualBusiness> listBusinesses() {
        return businessRepo.findByUserIdOrderByCreatedAtAsc(userId());
    }

    @PostMapping("/businesses")
    public ManualBusiness createBusiness(@RequestBody Map<String, Object> body) {
        ManualBusiness b = new ManualBusiness();
        b.setUserId(userId());
        apply(b, body);
        if (b.getName() == null || b.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
        }
        ManualBusiness saved = businessRepo.save(b);
        notificationClient.notify(userId(), "BUSINESS", "Business added",
                "\"" + saved.getName() + "\" is set up on TerraVest. You can now track its P&L, invoices and expenses.");
        return saved;
    }

    @PutMapping("/businesses/{id}")
    public ManualBusiness updateBusiness(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        ManualBusiness b = businessRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        apply(b, body);
        return businessRepo.save(b);
    }

    @DeleteMapping("/businesses/{id}")
    @Transactional
    public ResponseEntity<Void> deleteBusiness(@PathVariable Long id) {
        ManualBusiness b = businessRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        transactionRepo.deleteByBusinessIdAndUserId(b.getId(), userId());
        invoiceRepo.deleteByBusinessIdAndUserId(b.getId(), userId());
        linkedRepo.deleteByBusinessIdAndUserId(b.getId(), userId());
        documentRepo.deleteByBusinessIdAndUserId(b.getId(), userId());
        budgetRepo.deleteByBusinessIdAndUserId(b.getId(), userId());
        goalRepo.deleteByBusinessIdAndUserId(b.getId(), userId());
        vendorRepo.deleteByBusinessIdAndUserId(b.getId(), userId());
        expenseLinkRepo.deleteByBusinessIdAndUserId(b.getId(), userId()); // links before expenses
        expenseRepo.deleteByBusinessIdAndUserId(b.getId(), userId());
        accountRepo.deleteByBusinessIdAndUserId(b.getId(), userId());
        businessRepo.delete(b);
        return ResponseEntity.noContent().build();
    }

    private void apply(ManualBusiness b, Map<String, Object> body) {
        if (body.containsKey("name")) b.setName(str(body.get("name")));
        if (body.containsKey("industry")) b.setIndustry(str(body.get("industry")));
        if (body.containsKey("entityType")) b.setEntityType(str(body.get("entityType")));
        if (body.containsKey("ein")) b.setEin(str(body.get("ein")));
        if (body.containsKey("revenueMtd")) b.setRevenueMtd(money(body.get("revenueMtd")));
        if (body.containsKey("expensesMtd")) b.setExpensesMtd(money(body.get("expensesMtd")));
        if (body.containsKey("outstandingInvoices")) b.setOutstandingInvoices(money(body.get("outstandingInvoices")));
    }

    /* ---------------- Dashboards (ledger-derived, period-aware) ---------------- */

    /**
     * KPIs for one business over a period. {@code period} is one of
     * THIS_MONTH | THIS_YEAR | T12M | CUSTOM; for CUSTOM pass {@code from}/{@code to}
     * (ISO yyyy-MM-dd). Flow metrics sum over the range; balances/AR are today's.
     */
    @GetMapping("/businesses/{businessId}/summary")
    public com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessSummaryDto getSummary(
            @PathVariable Long businessId,
            @RequestParam(value = "period", defaultValue = "THIS_MONTH") String period,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to) {
        ManualBusiness biz = businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        PeriodResolver.Period p = PeriodResolver.resolve(period, from, to, LocalDate.now());
        return summaryService.summarize(userId(), biz, p.from(), p.to());
    }

    /**
     * The consolidated (all-businesses) dashboard for a period. Read-only.
     * Returns the per-business breakdown plus a rollup; parts sum to the whole.
     */
    @GetMapping("/summary")
    public com.mywealthmanagement.businessfinancialsservice.business.dto.ConsolidatedDashboardDto getConsolidated(
            @RequestParam(value = "period", defaultValue = "THIS_MONTH") String period,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to) {
        PeriodResolver.Period p = PeriodResolver.resolve(period, from, to, LocalDate.now());
        return summaryService.consolidate(userId(), p.key(), p.from(), p.to());
    }

    /* ---------------- Accounts ---------------- */

    @GetMapping("/businesses/{businessId}/accounts")
    public List<BusinessAccount> listAccounts(@PathVariable Long businessId) {
        // Ensures the business belongs to the caller.
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return accountRepo.findByBusinessIdAndUserIdOrderByCreatedAtAsc(businessId, userId());
    }

    @PostMapping("/businesses/{businessId}/accounts")
    public BusinessAccount createAccount(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        BusinessAccount a = new BusinessAccount();
        a.setUserId(userId());
        a.setBusinessId(businessId);
        a.setName(str(body.get("name")));
        a.setInstitution(str(body.get("institution")));
        a.setType(str(body.getOrDefault("type", "CHECKING")));
        a.setBalance(money(body.getOrDefault("balance", 0)));
        a.setCreditLimit(money(body.get("creditLimit")));
        if (a.getName() == null || a.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
        }
        return accountRepo.save(a);
    }

    @DeleteMapping("/accounts/{id}")
    @Transactional
    public ResponseEntity<Void> deleteAccount(@PathVariable Long id) {
        BusinessAccount a = accountRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        transactionRepo.deleteByAccountIdAndUserId(a.getId(), userId());
        accountRepo.delete(a);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- Linked-account assignment ---------------- */

    /** Aggregation account ids assigned to this business (what the business page shows). */
    @GetMapping("/businesses/{businessId}/linked-accounts")
    public List<String> listLinkedAccounts(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return linkedRepo.findByBusinessIdAndUserId(businessId, userId()).stream()
                .map(BusinessLinkedAccount::getLinkedAccountId)
                .toList();
    }

    /**
     * Global map of every linked-account assignment for the caller, as
     * {@code [{ "accountId": "12", "businessId": 3 }, ...]}. One row per account
     * (accounts are one-to-one with a business), so the UI can bind each linked
     * account to exactly one business without N per-business calls.
     */
    @GetMapping("/linked-accounts")
    public List<Map<String, Object>> listAllLinkedAccounts() {
        return linkedRepo.findByUserId(userId()).stream()
                .map(r -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("accountId", r.getLinkedAccountId());
                    m.put("businessId", r.getBusinessId());
                    return m;
                })
                .toList();
    }

    /** Replace the set of linked accounts assigned to this business. Body:
     *  {@code { "accountIds": ["12","34", ...] }}. Returns the saved set.
     *  Enforces one-to-one: each account is first detached from any OTHER business
     *  it was on, so assigning it here MOVES it rather than duplicating it. */
    @PutMapping("/businesses/{businessId}/linked-accounts")
    @Transactional
    public List<String> setLinkedAccounts(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Object raw = body.get("accountIds");
        java.util.LinkedHashSet<String> wanted = new java.util.LinkedHashSet<>();
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                String s = str(o);
                if (s != null) wanted.add(s);
            }
        }
        linkedRepo.deleteByBusinessIdAndUserId(businessId, userId());
        for (String aid : wanted) {
            // One-to-one: an account lives on a single business. Remove it from any
            // business (including a stale row on this one) before re-adding here.
            linkedRepo.deleteByUserIdAndLinkedAccountId(userId(), aid);
            BusinessLinkedAccount r = new BusinessLinkedAccount();
            r.setUserId(userId());
            r.setBusinessId(businessId);
            r.setLinkedAccountId(aid);
            linkedRepo.save(r);
        }
        return new java.util.ArrayList<>(wanted);
    }

    /* ---------------- Transactions ---------------- */

    /**
     * Lists transactions for a business, newest first. Pass {@code accountId} to
     * filter to a single account (checking / savings / credit card).
     */
    @GetMapping("/businesses/{businessId}/transactions")
    public List<BusinessTransaction> listTransactions(
            @PathVariable Long businessId,
            @RequestParam(value = "accountId", required = false) Long accountId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (accountId != null) {
            return transactionRepo.findByAccountIdAndUserIdOrderByPostedAtDescIdDesc(accountId, userId());
        }
        return transactionRepo.findByBusinessIdAndUserIdOrderByPostedAtDescIdDesc(businessId, userId());
    }

    @PostMapping("/businesses/{businessId}/transactions")
    public BusinessTransaction createTransaction(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Long accountId = longVal(body.get("accountId"));
        if (accountId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "accountId is required");
        }
        // Ensure the account belongs to the caller and this business.
        BusinessAccount account = accountRepo.findByIdAndUserId(accountId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "account not found"));
        if (!account.getBusinessId().equals(businessId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "account does not belong to this business");
        }

        BusinessTransaction t = new BusinessTransaction();
        t.setUserId(userId());
        t.setBusinessId(businessId);
        t.setAccountId(accountId);
        t.setDescription(str(body.get("description")));
        t.setMerchant(str(body.get("merchant")));
        t.setCategory(str(body.get("category")));
        t.setAmount(money(body.get("amount")));
        t.setPostedAt(date(body.get("postedAt")));
        if (t.getDescription() == null || t.getDescription().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "description is required");
        }
        if (t.getAmount() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "amount is required");
        }
        if (t.getPostedAt() == null) {
            t.setPostedAt(LocalDate.now());
        }
        return transactionRepo.save(t);
    }

    @DeleteMapping("/transactions/{id}")
    public ResponseEntity<Void> deleteTransaction(@PathVariable Long id) {
        BusinessTransaction t = transactionRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        transactionRepo.delete(t);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- Invoices ---------------- */

    @GetMapping("/businesses/{businessId}/invoices")
    public List<BusinessInvoice> listInvoices(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return invoiceRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(businessId, userId());
    }

    @PostMapping("/businesses/{businessId}/invoices")
    public BusinessInvoice createInvoice(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        BusinessInvoice inv = new BusinessInvoice();
        inv.setUserId(userId());
        inv.setBusinessId(businessId);
        inv.setCustomer(str(body.get("customer")));
        inv.setAmount(money(body.get("amount")));
        inv.setStatus(str(body.getOrDefault("status", "OPEN")));
        inv.setIssuedAt(date(body.getOrDefault("issuedAt", null)));
        inv.setDueDate(date(body.get("dueDate")));
        applyInvoiceContact(inv, body);
        if (inv.getCustomer() == null || inv.getCustomer().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "customer is required");
        }
        if (inv.getAmount() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "amount is required");
        }
        if (inv.getStatus() == null) inv.setStatus("OPEN");
        if (inv.getIssuedAt() == null) inv.setIssuedAt(LocalDate.now());
        BusinessInvoice saved = invoiceRepo.save(inv);
        String due = saved.getDueDate() != null ? " Due " + saved.getDueDate() + "." : "";
        notificationClient.notify(userId(), "BUSINESS", "Invoice created",
                "Invoice for " + usd(saved.getAmount()) + " to " + saved.getCustomer() + " was created." + due);
        return saved;
    }

    /** Update an invoice's status (e.g. mark paid). Other fields optional. */
    @PutMapping("/invoices/{id}")
    public BusinessInvoice updateInvoice(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        BusinessInvoice inv = invoiceRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String priorStatus = inv.getStatus();
        if (body.containsKey("customer")) inv.setCustomer(str(body.get("customer")));
        if (body.containsKey("amount")) inv.setAmount(money(body.get("amount")));
        if (body.containsKey("status")) inv.setStatus(str(body.get("status")));
        if (body.containsKey("dueDate")) inv.setDueDate(date(body.get("dueDate")));
        applyInvoiceContact(inv, body);
        BusinessInvoice saved = invoiceRepo.save(inv);
        // Notify when an invoice is newly marked paid — a positive, cash-in-the-door moment.
        if (!"PAID".equalsIgnoreCase(priorStatus) && "PAID".equalsIgnoreCase(saved.getStatus())) {
            notificationClient.notify(userId(), "BUSINESS", "Invoice paid",
                    saved.getCustomer() + " paid " + usd(saved.getAmount()) + ". Nice — that's money in the door.");
        }
        return saved;
    }

    /** Applies the optional contact / billing fields shared by create + update. */
    private void applyInvoiceContact(BusinessInvoice inv, Map<String, Object> body) {
        if (body.containsKey("invoiceNumber")) inv.setInvoiceNumber(str(body.get("invoiceNumber")));
        if (body.containsKey("customerEmail")) inv.setCustomerEmail(str(body.get("customerEmail")));
        if (body.containsKey("customerPhone")) inv.setCustomerPhone(str(body.get("customerPhone")));
        if (body.containsKey("notes")) inv.setNotes(str(body.get("notes")));
        if (body.containsKey("payInstructions")) inv.setPayInstructions(str(body.get("payInstructions")));
    }

    /* ---------------- Invoice send + payment reconciliation ---------------- */

    /**
     * Send an invoice to the customer by email or SMS. Body: { channel: EMAIL|SMS,
     * recipient? }. Mints a public token on first send and delivers a link to the
     * public invoice page. Returns the invoice, the delivery status, the public URL and
     * a ready-to-copy message (used as a fallback when SMS has no live provider).
     */
    @PostMapping("/invoices/{id}/send")
    public Map<String, Object> sendInvoice(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        BusinessInvoice inv = invoiceRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        ManualBusiness biz = businessRepo.findByIdAndUserId(inv.getBusinessId(), userId()).orElse(null);
        String channel = "SMS".equalsIgnoreCase(str(body.get("channel"))) ? "SMS" : "EMAIL";
        String recipient = str(body.get("recipient"));
        if (recipient == null) recipient = "SMS".equals(channel) ? inv.getCustomerPhone() : inv.getCustomerEmail();
        if (recipient == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Add the customer's " + ("SMS".equals(channel) ? "phone number" : "email") + " first.");
        }
        if (inv.getShareToken() == null) {
            inv.setShareToken(java.util.UUID.randomUUID().toString().replace("-", ""));
        }
        String bizName = biz != null ? biz.getName() : "our business";
        String base = webUrl == null || webUrl.isBlank() ? "" : webUrl.replaceAll("/+$", "");
        String publicUrl = base + "/invoice/" + inv.getShareToken();
        String subject = "Invoice from " + bizName + " — " + usd(inv.getAmount());
        String due = inv.getDueDate() != null ? " (due " + inv.getDueDate() + ")" : "";
        String message = "Hi " + inv.getCustomer() + ", here is your invoice from " + bizName
                + " for " + usd(inv.getAmount()) + due + ".\nView and pay: " + publicUrl;

        String status = commsClient.send(channel, recipient, subject, message);
        inv.setSentAt(java.time.LocalDateTime.now());
        inv.setSentChannel(channel);
        BusinessInvoice saved = invoiceRepo.save(inv);

        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("invoice", saved);
        out.put("deliveryStatus", status); // SENT | NO_PROVIDER | FAILED | DISABLED
        out.put("channel", channel);
        out.put("recipient", recipient);
        out.put("publicUrl", publicUrl);
        out.put("message", message); // copy-to-send fallback when NO_PROVIDER
        return out;
    }

    /**
     * Record a received payment and reconcile the invoice. Body: { paidAmount?,
     * paidAt?, paymentMethod?, paymentReference?, linkedTransactionId? }. Marks the
     * invoice PAID and, when given, links the business transaction that recorded the deposit.
     */
    @PostMapping("/invoices/{id}/payment")
    public BusinessInvoice recordPayment(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        BusinessInvoice inv = invoiceRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        java.math.BigDecimal paid = money(body.get("paidAmount"));
        inv.setPaidAmount(paid != null ? paid : inv.getAmount());
        inv.setPaidAt(date(body.get("paidAt")) != null ? date(body.get("paidAt")) : LocalDate.now());
        inv.setPaymentMethod(str(body.get("paymentMethod")));
        inv.setPaymentReference(str(body.get("paymentReference")));
        Long txId = longVal(body.get("linkedTransactionId"));
        if (txId != null) {
            // Ensure the transaction belongs to the caller before linking.
            transactionRepo.findByIdAndUserId(txId, userId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "linked transaction not found"));
            inv.setLinkedTransactionId(txId);
        }
        boolean wasPaid = "PAID".equalsIgnoreCase(inv.getStatus());
        inv.setStatus("PAID");
        BusinessInvoice saved = invoiceRepo.save(inv);
        if (!wasPaid) {
            notificationClient.notify(userId(), "BUSINESS", "Payment received",
                    saved.getCustomer() + " paid " + usd(saved.getPaidAmount()) + ". Invoice marked paid.");
        }
        return saved;
    }

    /** Public (unauthenticated) invoice view for the customer. Token-scoped; no user data. */
    @GetMapping("/invoices/public/{token}")
    public Map<String, Object> publicInvoice(@PathVariable String token) {
        BusinessInvoice inv = invoiceRepo.findByShareToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice not found"));
        ManualBusiness biz = businessRepo.findById(inv.getBusinessId()).orElse(null);
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("businessName", biz != null ? biz.getName() : "");
        m.put("invoiceNumber", inv.getInvoiceNumber());
        m.put("customer", inv.getCustomer());
        m.put("amount", inv.getAmount());
        m.put("status", inv.getStatus());
        m.put("issuedAt", inv.getIssuedAt());
        m.put("dueDate", inv.getDueDate());
        m.put("notes", inv.getNotes());
        m.put("payInstructions", inv.getPayInstructions());
        m.put("paidAt", inv.getPaidAt());
        m.put("paidAmount", inv.getPaidAmount());
        return m;
    }

    @DeleteMapping("/invoices/{id}")
    @Transactional
    public ResponseEntity<Void> deleteInvoice(@PathVariable Long id) {
        BusinessInvoice inv = invoiceRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        // Detach any documents pinned to this invoice; keep them in the doc center.
        documentRepo.findByBusinessIdAndUserIdAndInvoiceIdOrderByCreatedAtDesc(
                        inv.getBusinessId(), userId(), inv.getId())
                .forEach(d -> { d.setInvoiceId(null); documentRepo.save(d); });
        invoiceRepo.delete(inv);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- Document center ---------------- */

    /**
     * Documents attached to a business (link-based). Pass {@code invoiceId} to
     * list only the documents pinned to a specific invoice.
     */
    @GetMapping("/businesses/{businessId}/documents")
    public List<BusinessDocument> listDocuments(
            @PathVariable Long businessId,
            @RequestParam(value = "invoiceId", required = false) Long invoiceId,
            @RequestParam(value = "year", required = false) Integer year) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (invoiceId != null) {
            return documentRepo.findByBusinessIdAndUserIdAndInvoiceIdOrderByCreatedAtDesc(
                    businessId, userId(), invoiceId);
        }
        if (year != null) {
            return documentRepo.findByBusinessIdAndUserIdAndPeriodYearOrderByCreatedAtDesc(
                    businessId, userId(), year);
        }
        return documentRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(businessId, userId());
    }

    @PostMapping("/businesses/{businessId}/documents")
    public BusinessDocument createDocument(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        BusinessDocument d = new BusinessDocument();
        d.setUserId(userId());
        d.setBusinessId(businessId);
        d.setLabel(str(body.get("label")));
        d.setUrl(str(body.get("url")));
        d.setDocType(str(body.getOrDefault("docType", "OTHER")));
        d.setNote(str(body.get("note")));
        d.setPeriodYear(intVal(body.get("periodYear")));
        d.setPeriodMonth(intVal(body.get("periodMonth")));
        Long invoiceId = longVal(body.get("invoiceId"));
        if (invoiceId != null) {
            // Ensure the invoice belongs to the caller and this business before pinning.
            BusinessInvoice inv = invoiceRepo.findByIdAndUserId(invoiceId, userId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "invoice not found"));
            if (!inv.getBusinessId().equals(businessId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invoice does not belong to this business");
            }
            d.setInvoiceId(invoiceId);
        }
        if (d.getLabel() == null || d.getLabel().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "label is required");
        }
        if (d.getUrl() == null || d.getUrl().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "url is required");
        }
        if (d.getDocType() == null) d.setDocType("OTHER");
        return documentRepo.save(d);
    }

    /** Whether file uploads are available (GCS configured). The UI hides/enables the
     *  upload control accordingly and falls back to link-only when false. */
    @GetMapping("/documents/config")
    public Map<String, Object> documentConfig() {
        return Map.of("uploadEnabled", storageService.isEnabled());
    }

    /**
     * Upload a file/image into a business's document center. Multipart:
     * {@code file} (required) plus optional {@code label, docType, note,
     * periodYear, periodMonth, invoiceId}. Stored in Google Cloud Storage and
     * linked to the business. The same endpoint backs both the per-business and
     * the "All businesses" upload (the client passes the chosen businessId).
     */
    @PostMapping(value = "/businesses/{businessId}/documents/upload", consumes = "multipart/form-data")
    public BusinessDocument uploadDocument(
            @PathVariable Long businessId,
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file,
            @RequestParam(value = "label", required = false) String label,
            @RequestParam(value = "docType", required = false) String docType,
            @RequestParam(value = "note", required = false) String note,
            @RequestParam(value = "periodYear", required = false) String periodYear,
            @RequestParam(value = "periodMonth", required = false) String periodMonth,
            @RequestParam(value = "invoiceId", required = false) String invoiceId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "file is required");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (java.io.IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "could not read the uploaded file");
        }
        var stored = storageService.upload(userId(), businessId, file.getOriginalFilename(),
                file.getContentType(), bytes);

        BusinessDocument d = new BusinessDocument();
        d.setUserId(userId());
        d.setBusinessId(businessId);
        d.setStorageType("GCS");
        d.setObjectName(stored.objectName());
        d.setContentType(stored.contentType());
        d.setSizeBytes(stored.size());
        d.setOriginalFilename(file.getOriginalFilename());
        String lbl = str(label);
        d.setLabel(lbl != null ? lbl : (file.getOriginalFilename() == null ? "Uploaded file" : file.getOriginalFilename()));
        d.setDocType(str(docType) != null ? str(docType) : "OTHER");
        d.setNote(str(note));
        d.setPeriodYear(intVal(periodYear));
        d.setPeriodMonth(intVal(periodMonth));
        Long invId = longVal(invoiceId);
        if (invId != null) {
            BusinessInvoice inv = invoiceRepo.findByIdAndUserId(invId, userId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "invoice not found"));
            if (!inv.getBusinessId().equals(businessId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invoice does not belong to this business");
            }
            d.setInvoiceId(invId);
        }
        BusinessDocument saved = documentRepo.save(d);
        // Also register it in the user's personal Document Center (best-effort) so that
        // center remains the single source of truth — and keep the returned central id
        // so this document can reuse the center's secure-share.
        Long centralId = documentsRegistryClient.register(userId(), saved.getId(), saved.getLabel(), saved.getDocType(),
                saved.getContentType(), saved.getSizeBytes(), saved.getOriginalFilename());
        if (centralId != null) {
            saved.setCentralDocumentId(centralId);
            saved = documentRepo.save(saved);
        }
        return saved;
    }

    /** Stream an uploaded document's bytes back to the owner (authenticated). */
    @GetMapping("/documents/{id}/download")
    public ResponseEntity<byte[]> downloadDocument(@PathVariable Long id) {
        BusinessDocument d = documentRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!"GCS".equalsIgnoreCase(d.getStorageType()) || d.getObjectName() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "this document is a link, not an uploaded file");
        }
        var dl = storageService.download(d.getObjectName());
        String filename = d.getOriginalFilename() != null ? d.getOriginalFilename() : "document";
        return ResponseEntity.ok()
                .header("Content-Type", dl.contentType() != null ? dl.contentType() : "application/octet-stream")
                .header("Content-Disposition", "inline; filename=\"" + filename.replace("\"", "") + "\"")
                .body(dl.bytes());
    }

    @DeleteMapping("/documents/{id}")
    public ResponseEntity<Void> deleteDocument(@PathVariable Long id) {
        BusinessDocument d = documentRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        // Remove the stored object too (best-effort) so we don't orphan bytes in GCS.
        if ("GCS".equalsIgnoreCase(d.getStorageType())) {
            storageService.delete(d.getObjectName());
        }
        documentRepo.delete(d);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- Reconciliation ---------------- */

    /** External ids of the caller's reconciled transactions (linked or manual). */
    @GetMapping("/reconciliations")
    public List<String> listReconciliations() {
        return reconciledRepo.findByUserId(userId()).stream()
                .map(ReconciledTransaction::getExternalId)
                .toList();
    }

    /** Mark a transaction reconciled. Idempotent — re-marking is a no-op. */
    @PostMapping("/reconciliations")
    @Transactional
    public ResponseEntity<Void> addReconciliation(@RequestBody Map<String, Object> body) {
        String externalId = str(body.get("externalId"));
        if (externalId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "externalId is required");
        }
        if (!reconciledRepo.existsByUserIdAndExternalId(userId(), externalId)) {
            ReconciledTransaction r = new ReconciledTransaction();
            r.setUserId(userId());
            r.setExternalId(externalId);
            reconciledRepo.save(r);
        }
        return ResponseEntity.noContent().build();
    }

    /** Clear a transaction's reconciled flag. Idempotent. */
    @DeleteMapping("/reconciliations/{externalId}")
    @Transactional
    public ResponseEntity<Void> removeReconciliation(@PathVariable String externalId) {
        reconciledRepo.deleteByUserIdAndExternalId(userId(), externalId);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- Transaction type/tag overrides ---------------- */

    /** The caller's transaction overrides, as {externalId, type, tags[]}. */
    @GetMapping("/tx-overrides")
    public List<Map<String, Object>> listTxOverrides() {
        return overrideRepo.findByUserId(userId()).stream()
                .map(this::overrideToMap)
                .toList();
    }

    /** Upsert the type/tags override for a transaction. Sending an empty type
     *  and no tags clears the override entirely. */
    @PutMapping("/tx-overrides/{externalId}")
    @Transactional
    public ResponseEntity<Map<String, Object>> upsertTxOverride(
            @PathVariable String externalId, @RequestBody Map<String, Object> body) {
        String type = str(body.get("type"));
        String tags = normalizeTags(body.get("tags"));

        // No meaningful override left → remove any existing row.
        if (type == null && tags == null) {
            overrideRepo.deleteByUserIdAndExternalId(userId(), externalId);
            return ResponseEntity.noContent().build();
        }

        TransactionOverride o = overrideRepo.findByUserIdAndExternalId(userId(), externalId)
                .orElseGet(() -> {
                    TransactionOverride n = new TransactionOverride();
                    n.setUserId(userId());
                    n.setExternalId(externalId);
                    return n;
                });
        o.setOverrideType(type);
        o.setTags(tags);
        return ResponseEntity.ok(overrideToMap(overrideRepo.save(o)));
    }

    /** Remove a transaction's override (revert to derived type, no tags). */
    @DeleteMapping("/tx-overrides/{externalId}")
    @Transactional
    public ResponseEntity<Void> deleteTxOverride(@PathVariable String externalId) {
        overrideRepo.deleteByUserIdAndExternalId(userId(), externalId);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- Budgets (per-business, per-category monthly limits) ---------------- */

    /** The caller's budgets for a business, as {category, monthlyLimit}. */
    @GetMapping("/businesses/{businessId}/budgets")
    public List<Map<String, Object>> listBudgets(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
        return budgetRepo.findByUserIdAndBusinessIdOrderByCategoryAsc(userId(), businessId).stream()
                .map(this::budgetToMap)
                .toList();
    }

    /** Upsert the monthly limit for a category. A limit &le; 0 removes the budget. */
    @PutMapping("/businesses/{businessId}/budgets/{category}")
    @Transactional
    public ResponseEntity<Map<String, Object>> upsertBudget(
            @PathVariable Long businessId, @PathVariable String category, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
        String cat = str(category);
        if (cat == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Category is required");
        BigDecimal limit = money(body.get("monthlyLimit"));
        if (limit == null || limit.signum() <= 0) {
            budgetRepo.deleteByUserIdAndBusinessIdAndCategory(userId(), businessId, cat);
            return ResponseEntity.noContent().build();
        }
        BusinessBudget b = budgetRepo.findByUserIdAndBusinessIdAndCategory(userId(), businessId, cat)
                .orElseGet(() -> {
                    BusinessBudget n = new BusinessBudget();
                    n.setUserId(userId());
                    n.setBusinessId(businessId);
                    n.setCategory(cat);
                    return n;
                });
        b.setMonthlyLimit(limit);
        return ResponseEntity.ok(budgetToMap(budgetRepo.save(b)));
    }

    /** Remove a category's budget. */
    @DeleteMapping("/businesses/{businessId}/budgets/{category}")
    @Transactional
    public ResponseEntity<Void> deleteBudget(@PathVariable Long businessId, @PathVariable String category) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
        budgetRepo.deleteByUserIdAndBusinessIdAndCategory(userId(), businessId, str(category));
        return ResponseEntity.noContent().build();
    }

    /* ---------------- Vendors (metadata overlay: status, renewal, notes) ---------------- */

    /** The caller's vendor overlays for a business, as {vendorName, status, renewalDate, notes}. */
    @GetMapping("/businesses/{businessId}/vendors")
    public List<Map<String, Object>> listVendors(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
        return vendorRepo.findByUserIdAndBusinessIdOrderByVendorNameAsc(userId(), businessId).stream()
                .map(this::vendorToMap)
                .toList();
    }

    /** Upsert a vendor's overlay. Body: {status?, renewalDate?, notes?}. */
    @PutMapping("/businesses/{businessId}/vendors/{vendorName}")
    @Transactional
    public ResponseEntity<Map<String, Object>> upsertVendor(
            @PathVariable Long businessId, @PathVariable String vendorName, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
        String name = str(vendorName);
        if (name == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vendor name is required");
        BusinessVendor v = vendorRepo.findByUserIdAndBusinessIdAndVendorName(userId(), businessId, name)
                .orElseGet(() -> {
                    BusinessVendor n = new BusinessVendor();
                    n.setUserId(userId());
                    n.setBusinessId(businessId);
                    n.setVendorName(name);
                    return n;
                });
        if (body.containsKey("status")) {
            String s = str(body.get("status"));
            v.setStatus(s == null ? "ACTIVE" : s.toUpperCase());
        }
        if (body.containsKey("renewalDate")) v.setRenewalDate(parseDate(body.get("renewalDate")));
        if (body.containsKey("notes")) v.setNotes(str(body.get("notes")));
        return ResponseEntity.ok(vendorToMap(vendorRepo.save(v)));
    }

    /** Remove a vendor's overlay (reverts to computed-only). */
    @DeleteMapping("/businesses/{businessId}/vendors/{vendorName}")
    @Transactional
    public ResponseEntity<Void> deleteVendor(@PathVariable Long businessId, @PathVariable String vendorName) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
        vendorRepo.deleteByUserIdAndBusinessIdAndVendorName(userId(), businessId, str(vendorName));
        return ResponseEntity.noContent().build();
    }

    private LocalDate parseDate(Object o) {
        String s = str(o);
        if (s == null) return null;
        try { return LocalDate.parse(s); } catch (RuntimeException e) { return null; }
    }
    private Map<String, Object> vendorToMap(BusinessVendor v) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("vendorName", v.getVendorName());
        m.put("status", v.getStatus());
        m.put("renewalDate", v.getRenewalDate());
        m.put("notes", v.getNotes());
        return m;
    }

    /* ---------------- Goals (cash reserve + tax set-aside, one row per business) ---------------- */

    /** The business's goals, as {reserveTarget, taxRate, taxSetAside}. Zeros when unset. */
    @GetMapping("/businesses/{businessId}/goals")
    public Map<String, Object> getGoals(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
        return goalRepo.findByUserIdAndBusinessId(userId(), businessId)
                .map(this::goalToMap)
                .orElseGet(() -> {
                    Map<String, Object> m = new java.util.LinkedHashMap<>();
                    m.put("reserveTarget", BigDecimal.ZERO);
                    m.put("taxRate", BigDecimal.ZERO);
                    m.put("taxSetAside", BigDecimal.ZERO);
                    return m;
                });
    }

    /** Upsert the business's goals. Only the fields present in the body are changed. */
    @PutMapping("/businesses/{businessId}/goals")
    @Transactional
    public ResponseEntity<Map<String, Object>> putGoals(
            @PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
        BusinessGoal g = goalRepo.findByUserIdAndBusinessId(userId(), businessId)
                .orElseGet(() -> {
                    BusinessGoal n = new BusinessGoal();
                    n.setUserId(userId());
                    n.setBusinessId(businessId);
                    return n;
                });
        if (body.containsKey("reserveTarget")) g.setReserveTarget(nonNeg(money(body.get("reserveTarget"))));
        if (body.containsKey("taxRate")) g.setTaxRate(clampPct(money(body.get("taxRate"))));
        if (body.containsKey("taxSetAside")) g.setTaxSetAside(nonNeg(money(body.get("taxSetAside"))));
        return ResponseEntity.ok(goalToMap(goalRepo.save(g)));
    }

    private BigDecimal nonNeg(BigDecimal v) {
        if (v == null || v.signum() < 0) return BigDecimal.ZERO;
        return v;
    }
    private BigDecimal clampPct(BigDecimal v) {
        if (v == null || v.signum() < 0) return BigDecimal.ZERO;
        return v.compareTo(new BigDecimal("100")) > 0 ? new BigDecimal("100") : v;
    }
    private Map<String, Object> goalToMap(BusinessGoal g) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("reserveTarget", g.getReserveTarget());
        m.put("taxRate", g.getTaxRate());
        m.put("taxSetAside", g.getTaxSetAside());
        return m;
    }

    private Map<String, Object> budgetToMap(BusinessBudget b) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("category", b.getCategory());
        m.put("monthlyLimit", b.getMonthlyLimit());
        return m;
    }

    private Map<String, Object> overrideToMap(TransactionOverride o) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("externalId", o.getExternalId());
        m.put("type", o.getOverrideType());
        m.put("tags", o.getTags() == null ? List.of()
                : java.util.Arrays.stream(o.getTags().split(","))
                        .map(String::trim).filter(s -> !s.isEmpty()).toList());
        return m;
    }

    /** Accepts a comma-separated string or a list; returns a cleaned
     *  comma-separated string (deduped, trimmed) or null if empty. */
    private String normalizeTags(Object raw) {
        if (raw == null) return null;
        java.util.stream.Stream<String> parts;
        if (raw instanceof List<?> list) {
            parts = list.stream().map(o -> o == null ? "" : o.toString());
        } else {
            parts = java.util.Arrays.stream(raw.toString().split(","));
        }
        java.util.LinkedHashSet<String> cleaned = parts
                .map(String::trim).filter(s -> !s.isEmpty())
                .collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new));
        return cleaned.isEmpty() ? null : String.join(",", cleaned);
    }

    /* ---------------- helpers ---------------- */

    /** Compact USD for notification copy, e.g. 1500 -> "$1500". Null-safe. */
    private static String usd(java.math.BigDecimal amount) {
        return amount == null ? "$0" : "$" + amount.stripTrailingZeros().toPlainString();
    }

    private String str(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private BigDecimal money(Object o) {
        if (o == null) return null;
        try {
            return new BigDecimal(o.toString().replace(",", "").trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Long longVal(Object o) {
        if (o == null) return null;
        try {
            return Long.valueOf(o.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Integer intVal(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        if (s.isEmpty()) return null;
        try {
            // tolerate "2026.0" style numeric input from JSON
            return (int) Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Parses an ISO date (yyyy-MM-dd); tolerates a full ISO datetime by taking the date part. */
    private LocalDate date(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        if (s.isEmpty()) return null;
        try {
            if (s.length() > 10) s = s.substring(0, 10);
            return LocalDate.parse(s);
        } catch (Exception e) {
            return null;
        }
    }
}
