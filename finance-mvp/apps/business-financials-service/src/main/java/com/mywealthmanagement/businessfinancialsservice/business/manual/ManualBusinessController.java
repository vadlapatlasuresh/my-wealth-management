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
    private final com.mywealthmanagement.businessfinancialsservice.comms.NotificationClient notificationClient;

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

    /** Replace the set of linked accounts assigned to this business. Body:
     *  {@code { "accountIds": ["12","34", ...] }}. Returns the saved set. */
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
        BusinessInvoice saved = invoiceRepo.save(inv);
        // Notify when an invoice is newly marked paid — a positive, cash-in-the-door moment.
        if (!"PAID".equalsIgnoreCase(priorStatus) && "PAID".equalsIgnoreCase(saved.getStatus())) {
            notificationClient.notify(userId(), "BUSINESS", "Invoice paid",
                    saved.getCustomer() + " paid " + usd(saved.getAmount()) + ". Nice — that's money in the door.");
        }
        return saved;
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
            @RequestParam(value = "invoiceId", required = false) Long invoiceId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (invoiceId != null) {
            return documentRepo.findByBusinessIdAndUserIdAndInvoiceIdOrderByCreatedAtDesc(
                    businessId, userId(), invoiceId);
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

    @DeleteMapping("/documents/{id}")
    public ResponseEntity<Void> deleteDocument(@PathVariable Long id) {
        BusinessDocument d = documentRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
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
