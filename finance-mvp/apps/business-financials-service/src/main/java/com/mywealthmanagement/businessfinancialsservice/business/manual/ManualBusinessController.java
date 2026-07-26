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
    private final BusinessCustomerRepository customerRepo;
    private final BusinessInvoiceLineItemRepository lineItemRepo;
    private final BusinessQuoteRepository quoteRepo;
    private final BusinessQuoteLineItemRepository quoteLineItemRepo;
    private final BusinessRecurringInvoiceRepository recurringRepo;
    private final BusinessRecurringInvoiceItemRepository recurringItemRepo;
    private final com.mywealthmanagement.businessfinancialsservice.business.recurring.RecurringInvoiceService recurringService;
    private final BusinessProjectRepository projectRepo;
    private final BusinessProjectMilestoneRepository milestoneRepo;
    private final BusinessTaxRateRepository taxRateRepo;
    private final com.mywealthmanagement.businessfinancialsservice.business.pay.InvoicePaymentProvider paymentProvider;
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
        quoteRepo.deleteByBusinessIdAndUserId(b.getId(), userId()); // quote line items cascade at DB
        recurringRepo.deleteByBusinessIdAndUserId(b.getId(), userId()); // recurring items cascade at DB
        projectRepo.deleteByBusinessIdAndUserId(b.getId(), userId()); // milestones cascade at DB
        taxRateRepo.deleteByBusinessIdAndUserId(b.getId(), userId());
        customerRepo.deleteByBusinessIdAndUserId(b.getId(), userId()); // after invoices + quotes (FK)
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

    /* ---------------- Customers / Contacts ---------------- */

    /** All customers for a business (active first via display-name ordering). */
    @GetMapping("/businesses/{businessId}/customers")
    public List<BusinessCustomer> listCustomers(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
        return customerRepo.findByBusinessIdAndUserIdOrderByDisplayNameAsc(businessId, userId());
    }

    @PostMapping("/businesses/{businessId}/customers")
    public BusinessCustomer createCustomer(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
        BusinessCustomer c = new BusinessCustomer();
        c.setUserId(userId());
        c.setBusinessId(businessId);
        applyCustomer(c, body);
        if (c.getDisplayName() == null || c.getDisplayName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A customer name is required");
        }
        return customerRepo.save(c);
    }

    @PutMapping("/businesses/{businessId}/customers/{id}")
    public BusinessCustomer updateCustomer(
            @PathVariable Long businessId, @PathVariable Long id, @RequestBody Map<String, Object> body) {
        BusinessCustomer c = customerRepo.findByIdAndBusinessIdAndUserId(id, businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer not found"));
        applyCustomer(c, body);
        return customerRepo.save(c);
    }

    @DeleteMapping("/businesses/{businessId}/customers/{id}")
    public ResponseEntity<Void> deleteCustomer(@PathVariable Long businessId, @PathVariable Long id) {
        BusinessCustomer c = customerRepo.findByIdAndBusinessIdAndUserId(id, businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer not found"));
        // FK on business_invoices.customer_id is ON DELETE SET NULL, so historical
        // invoices keep their inline customer snapshot and are never destroyed.
        customerRepo.delete(c);
        return ResponseEntity.noContent().build();
    }

    /** Applies the editable customer fields shared by create + update. */
    private void applyCustomer(BusinessCustomer c, Map<String, Object> body) {
        if (body.containsKey("displayName")) c.setDisplayName(str(body.get("displayName")));
        if (body.containsKey("firstName")) c.setFirstName(str(body.get("firstName")));
        if (body.containsKey("lastName")) c.setLastName(str(body.get("lastName")));
        if (body.containsKey("company")) c.setCompany(str(body.get("company")));
        if (body.containsKey("email")) c.setEmail(str(body.get("email")));
        if (body.containsKey("phone")) c.setPhone(str(body.get("phone")));
        if (body.containsKey("mobile")) c.setMobile(str(body.get("mobile")));
        if (body.containsKey("taxId")) c.setTaxId(str(body.get("taxId")));
        if (body.containsKey("preferredPaymentMethod")) {
            String m = str(body.get("preferredPaymentMethod"));
            c.setPreferredPaymentMethod(m == null ? null : m.toUpperCase());
        }
        if (body.containsKey("billingLine1")) c.setBillingLine1(str(body.get("billingLine1")));
        if (body.containsKey("billingLine2")) c.setBillingLine2(str(body.get("billingLine2")));
        if (body.containsKey("billingCity")) c.setBillingCity(str(body.get("billingCity")));
        if (body.containsKey("billingRegion")) c.setBillingRegion(str(body.get("billingRegion")));
        if (body.containsKey("billingPostal")) c.setBillingPostal(str(body.get("billingPostal")));
        if (body.containsKey("billingCountry")) c.setBillingCountry(country(body.get("billingCountry")));
        if (body.containsKey("shippingSameAsBilling")) c.setShippingSameAsBilling(bool(body.get("shippingSameAsBilling"), true));
        if (body.containsKey("shippingLine1")) c.setShippingLine1(str(body.get("shippingLine1")));
        if (body.containsKey("shippingLine2")) c.setShippingLine2(str(body.get("shippingLine2")));
        if (body.containsKey("shippingCity")) c.setShippingCity(str(body.get("shippingCity")));
        if (body.containsKey("shippingRegion")) c.setShippingRegion(str(body.get("shippingRegion")));
        if (body.containsKey("shippingPostal")) c.setShippingPostal(str(body.get("shippingPostal")));
        if (body.containsKey("shippingCountry")) c.setShippingCountry(country(body.get("shippingCountry")));
        if (body.containsKey("notes")) c.setNotes(str(body.get("notes")));
        if (body.containsKey("status")) {
            String s = str(body.get("status"));
            c.setStatus(s == null ? BusinessCustomer.STATUS_ACTIVE : s.toUpperCase());
        }
        // Convenience: derive a display name from first/last when the client omits it.
        if ((c.getDisplayName() == null || c.getDisplayName().isBlank())
                && (c.getFirstName() != null || c.getLastName() != null)) {
            c.setDisplayName(((str(c.getFirstName()) == null ? "" : c.getFirstName()) + " "
                    + (str(c.getLastName()) == null ? "" : c.getLastName())).trim());
        }
    }

    /** Normalises a country input to an ISO alpha-2 code (upper-cased, first 2 chars). */
    private String country(Object o) {
        String s = str(o);
        if (s == null) return null;
        s = s.trim().toUpperCase();
        return s.length() > 2 ? s.substring(0, 2) : s;
    }

    private boolean bool(Object o, boolean dflt) {
        if (o == null) return dflt;
        if (o instanceof Boolean b) return b;
        String s = String.valueOf(o).trim();
        return s.equalsIgnoreCase("true") || s.equals("1") || s.equalsIgnoreCase("yes");
    }

    /* ---------------- Sales-tax rates ---------------- */

    @GetMapping("/businesses/{businessId}/tax-rates")
    public List<BusinessTaxRate> listTaxRates(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return taxRateRepo.findByBusinessIdAndUserIdOrderByNameAsc(businessId, userId());
    }

    @PostMapping("/businesses/{businessId}/tax-rates")
    public BusinessTaxRate createTaxRate(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        BusinessTaxRate t = new BusinessTaxRate();
        t.setUserId(userId());
        t.setBusinessId(businessId);
        applyTaxRate(t, body);
        if (t.getName() == null || t.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A tax name is required");
        }
        if (t.getRate() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A rate is required");
        return taxRateRepo.save(t);
    }

    @PutMapping("/businesses/{businessId}/tax-rates/{id}")
    public BusinessTaxRate updateTaxRate(@PathVariable Long businessId, @PathVariable Long id, @RequestBody Map<String, Object> body) {
        BusinessTaxRate t = taxRateRepo.findByIdAndBusinessIdAndUserId(id, businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tax rate not found"));
        applyTaxRate(t, body);
        return taxRateRepo.save(t);
    }

    @DeleteMapping("/businesses/{businessId}/tax-rates/{id}")
    public ResponseEntity<Void> deleteTaxRate(@PathVariable Long businessId, @PathVariable Long id) {
        BusinessTaxRate t = taxRateRepo.findByIdAndBusinessIdAndUserId(id, businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tax rate not found"));
        taxRateRepo.delete(t);
        return ResponseEntity.noContent().build();
    }

    /**
     * Resolve the sales-tax rate that applies to a location (order-to-cash Phase 1.7). Pass a
     * {@code customerId} (uses their billing address) or explicit country/region/postal.
     * Returns {@code { rate, name, taxRateId }} — rate is null when nothing applies.
     */
    @GetMapping("/businesses/{businessId}/tax-rates/resolve")
    public Map<String, Object> resolveTaxRate(@PathVariable Long businessId,
                                              @RequestParam(required = false) Long customerId,
                                              @RequestParam(required = false) String country,
                                              @RequestParam(required = false) String region,
                                              @RequestParam(required = false) String postal) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (customerId != null) {
            BusinessCustomer c = customerRepo.findByIdAndBusinessIdAndUserId(customerId, businessId, userId()).orElse(null);
            if (c != null) {
                country = c.getBillingCountry();
                region = c.getBillingRegion();
                postal = c.getBillingPostal();
            }
        }
        BusinessTaxRate r = TaxRateResolver.resolve(
                taxRateRepo.findByBusinessIdAndUserIdAndActiveTrue(businessId, userId()), country, region, postal);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("rate", r != null ? r.getRate() : null);
        out.put("name", r != null ? r.getName() : null);
        out.put("taxRateId", r != null ? r.getId() : null);
        return out;
    }

    private void applyTaxRate(BusinessTaxRate t, Map<String, Object> body) {
        if (body.containsKey("name")) t.setName(str(body.get("name")));
        if (body.containsKey("rate")) t.setRate(money(body.get("rate")));
        if (body.containsKey("country")) t.setCountry(country(body.get("country")));
        if (body.containsKey("region")) t.setRegion(str(body.get("region")));
        if (body.containsKey("postal")) t.setPostal(str(body.get("postal")));
        if (body.containsKey("isDefault")) t.setDefault(bool(body.get("isDefault"), false));
        if (body.containsKey("active")) t.setActive(bool(body.get("active"), true));
    }

    /** The tax rate (percent) that applies to a saved customer's billing location, or null. */
    private java.math.BigDecimal resolvedTaxRate(Long businessId, Long customerId) {
        if (customerId == null) return null;
        BusinessCustomer c = customerRepo.findByIdAndBusinessIdAndUserId(customerId, businessId, userId()).orElse(null);
        if (c == null) return null;
        BusinessTaxRate r = TaxRateResolver.resolve(
                taxRateRepo.findByBusinessIdAndUserIdAndActiveTrue(businessId, userId()),
                c.getBillingCountry(), c.getBillingRegion(), c.getBillingPostal());
        return r != null ? r.getRate() : null;
    }

    /* ---------------- Quotes / Estimates ---------------- */

    @GetMapping("/businesses/{businessId}/quotes")
    public List<BusinessQuote> listQuotes(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<BusinessQuote> quotes = quoteRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(businessId, userId());
        if (!quotes.isEmpty()) {
            java.util.Map<Long, java.util.List<BusinessQuoteLineItem>> byQuote =
                    quoteLineItemRepo.findByQuoteIdInOrderByPositionAsc(quotes.stream().map(BusinessQuote::getId).toList())
                            .stream().collect(java.util.stream.Collectors.groupingBy(BusinessQuoteLineItem::getQuoteId));
            for (BusinessQuote q : quotes) q.setLineItems(byQuote.getOrDefault(q.getId(), java.util.List.of()));
        }
        return quotes;
    }

    @PostMapping("/businesses/{businessId}/quotes")
    public BusinessQuote createQuote(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        BusinessQuote q = new BusinessQuote();
        q.setUserId(userId());
        q.setBusinessId(businessId);
        applyQuoteFields(q, body, businessId);
        if (q.getCustomer() == null || q.getCustomer().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "customer is required");
        }
        if (q.getStatus() == null) q.setStatus("DRAFT");
        if (q.getIssuedAt() == null) q.setIssuedAt(LocalDate.now());
        if (!body.containsKey("taxRate") && q.getCustomerId() != null) {
            java.math.BigDecimal auto = resolvedTaxRate(businessId, q.getCustomerId());
            if (auto != null) q.setTaxRate(auto);
        }
        List<BusinessQuoteLineItem> parsed = applyQuoteLineItemsAndTotals(q, body);
        BusinessQuote saved = quoteRepo.save(q);
        persistQuoteLineItems(saved, parsed);
        return saved;
    }

    @PutMapping("/quotes/{id}")
    public BusinessQuote updateQuote(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        BusinessQuote q = quoteRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if ("CONVERTED".equalsIgnoreCase(q.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This quote was already converted to an invoice.");
        }
        applyQuoteFields(q, body, q.getBusinessId());
        List<BusinessQuoteLineItem> parsed = applyQuoteLineItemsAndTotals(q, body);
        BusinessQuote saved = quoteRepo.save(q);
        persistQuoteLineItems(saved, parsed);
        return saved;
    }

    @DeleteMapping("/quotes/{id}")
    public ResponseEntity<Void> deleteQuote(@PathVariable Long id) {
        BusinessQuote q = quoteRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        quoteRepo.delete(q); // quote_line_items FK is ON DELETE CASCADE
        return ResponseEntity.noContent().build();
    }

    /**
     * One-click convert: create a real invoice (with copied line items and money breakdown)
     * from a quote, then stamp the quote CONVERTED and record the new invoice id. Body may
     * carry an optional {@code dueDate}. Idempotent-ish: re-converting is refused.
     */
    @PostMapping("/quotes/{id}/convert")
    @Transactional
    public BusinessInvoice convertQuote(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        BusinessQuote q = quoteRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if ("CONVERTED".equalsIgnoreCase(q.getStatus()) && q.getConvertedInvoiceId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This quote was already converted to an invoice.");
        }
        Map<String, Object> b = body == null ? Map.of() : body;

        BusinessInvoice inv = new BusinessInvoice();
        inv.setUserId(userId());
        inv.setBusinessId(q.getBusinessId());
        inv.setCustomerId(q.getCustomerId());
        inv.setCustomer(q.getCustomer());
        inv.setCustomerEmail(q.getCustomerEmail());
        inv.setCustomerPhone(q.getCustomerPhone());
        inv.setStatus("OPEN");
        inv.setIssuedAt(LocalDate.now());
        inv.setDueDate(date(b.get("dueDate")));
        inv.setNotes(q.getNotes());
        // Copy the money breakdown verbatim (amount stays the authoritative total).
        inv.setSubtotal(q.getSubtotal());
        inv.setDiscountType(q.getDiscountType());
        inv.setDiscountValue(q.getDiscountValue());
        inv.setDiscountAmount(q.getDiscountAmount());
        inv.setTaxRate(q.getTaxRate());
        inv.setTaxAmount(q.getTaxAmount());
        inv.setAmount(q.getAmount() == null ? java.math.BigDecimal.ZERO : q.getAmount());
        BusinessInvoice savedInv = invoiceRepo.save(inv);

        // Copy line items over.
        List<BusinessQuoteLineItem> qLines = quoteLineItemRepo.findByQuoteIdOrderByPositionAsc(q.getId());
        List<BusinessInvoiceLineItem> invLines = new java.util.ArrayList<>();
        for (BusinessQuoteLineItem ql : qLines) {
            BusinessInvoiceLineItem li = new BusinessInvoiceLineItem();
            li.setInvoiceId(savedInv.getId());
            li.setUserId(userId());
            li.setPosition(ql.getPosition());
            li.setDescription(ql.getDescription());
            li.setQuantity(ql.getQuantity());
            li.setUnitPrice(ql.getUnitPrice());
            li.setAmount(ql.getAmount());
            invLines.add(li);
        }
        savedInv.setLineItems(lineItemRepo.saveAll(invLines));

        q.setStatus("CONVERTED");
        q.setConvertedInvoiceId(savedInv.getId());
        quoteRepo.save(q);

        notificationClient.notify(userId(), "BUSINESS", "Quote converted",
                "Quote for " + usd(savedInv.getAmount()) + " to " + savedInv.getCustomer()
                        + " is now an invoice.");
        return savedInv;
    }

    /** Applies the editable header fields (customer, dates, number, status, notes) on a quote. */
    private void applyQuoteFields(BusinessQuote q, Map<String, Object> body, Long businessId) {
        if (body.containsKey("customer")) q.setCustomer(str(body.get("customer")));
        if (body.containsKey("customerEmail")) q.setCustomerEmail(str(body.get("customerEmail")));
        if (body.containsKey("customerPhone")) q.setCustomerPhone(str(body.get("customerPhone")));
        if (body.containsKey("quoteNumber")) q.setQuoteNumber(str(body.get("quoteNumber")));
        if (body.containsKey("notes")) q.setNotes(str(body.get("notes")));
        if (body.containsKey("issuedAt")) q.setIssuedAt(date(body.get("issuedAt")));
        if (body.containsKey("expiryDate")) q.setExpiryDate(date(body.get("expiryDate")));
        if (body.containsKey("status")) {
            String s = str(body.get("status"));
            if (s != null) q.setStatus(s.toUpperCase());
        }
        // Optional saved-customer link + inline snapshot back-fill (mirrors invoices).
        if (body.containsKey("customerId")) {
            Long customerId = asLong(body.get("customerId"));
            if (customerId == null || customerId == 0L) {
                q.setCustomerId(null);
            } else {
                BusinessCustomer c = customerRepo.findByIdAndBusinessIdAndUserId(customerId, businessId, userId())
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown customer"));
                q.setCustomerId(c.getId());
                if (!body.containsKey("customer") || str(body.get("customer")) == null) q.setCustomer(c.getDisplayName());
                if (!body.containsKey("customerEmail") && q.getCustomerEmail() == null) q.setCustomerEmail(c.getEmail());
                if (!body.containsKey("customerPhone") && q.getCustomerPhone() == null) {
                    q.setCustomerPhone(c.getMobile() != null ? c.getMobile() : c.getPhone());
                }
            }
        }
    }

    /** Parses {@code lineItems} into quote lines and recomputes the quote's money breakdown. */
    private List<BusinessQuoteLineItem> applyQuoteLineItemsAndTotals(BusinessQuote q, Map<String, Object> body) {
        if (!body.containsKey("lineItems")) return null;
        List<BusinessQuoteLineItem> lines = new java.util.ArrayList<>();
        java.math.BigDecimal subtotal = java.math.BigDecimal.ZERO;
        if (body.get("lineItems") instanceof List<?> list) {
            int pos = 0;
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                String desc = str(m.get("description"));
                java.math.BigDecimal qty = money(m.get("quantity"));
                java.math.BigDecimal price = money(m.get("unitPrice"));
                if (qty == null) qty = java.math.BigDecimal.ONE;
                if (price == null) price = java.math.BigDecimal.ZERO;
                if ((desc == null || desc.isBlank()) && price.signum() == 0) continue;
                if (desc == null || desc.isBlank()) desc = "Item";
                if (desc.length() > 500) desc = desc.substring(0, 500);
                java.math.BigDecimal amt = qty.multiply(price).setScale(2, java.math.RoundingMode.HALF_UP);
                BusinessQuoteLineItem li = new BusinessQuoteLineItem();
                li.setUserId(userId());
                li.setPosition(pos++);
                li.setDescription(desc);
                li.setQuantity(qty);
                li.setUnitPrice(price);
                li.setAmount(amt);
                lines.add(li);
                subtotal = subtotal.add(amt);
            }
        }
        String discType = body.containsKey("discountType")
                ? (str(body.get("discountType")) == null ? null : str(body.get("discountType")).toUpperCase())
                : q.getDiscountType();
        java.math.BigDecimal discVal = body.containsKey("discountValue") ? money(body.get("discountValue")) : q.getDiscountValue();
        java.math.BigDecimal taxRate = body.containsKey("taxRate") ? money(body.get("taxRate")) : q.getTaxRate();
        InvoiceMath.Breakdown br = InvoiceMath.compute(subtotal, discType, discVal, taxRate);
        q.setSubtotal(br.subtotal());
        q.setDiscountType(br.discountType());
        q.setDiscountValue(br.discountValue());
        q.setDiscountAmount(br.discountAmount());
        q.setTaxRate(br.taxRate());
        q.setTaxAmount(br.taxAmount());
        q.setAmount(br.total());
        return lines;
    }

    private void persistQuoteLineItems(BusinessQuote q, List<BusinessQuoteLineItem> lines) {
        if (lines == null) {
            q.setLineItems(quoteLineItemRepo.findByQuoteIdOrderByPositionAsc(q.getId()));
            return;
        }
        quoteLineItemRepo.deleteByQuoteId(q.getId());
        for (BusinessQuoteLineItem li : lines) li.setQuoteId(q.getId());
        q.setLineItems(quoteLineItemRepo.saveAll(lines));
    }

    /* ---------------- Recurring invoices (subscriptions) ---------------- */

    @GetMapping("/businesses/{businessId}/recurring-invoices")
    public List<BusinessRecurringInvoice> listRecurring(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<BusinessRecurringInvoice> list = recurringRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(businessId, userId());
        if (!list.isEmpty()) {
            java.util.Map<Long, java.util.List<BusinessRecurringInvoiceItem>> byId =
                    recurringItemRepo.findByScheduleIdInOrderByPositionAsc(list.stream().map(BusinessRecurringInvoice::getId).toList())
                            .stream().collect(java.util.stream.Collectors.groupingBy(BusinessRecurringInvoiceItem::getScheduleId));
            for (BusinessRecurringInvoice s : list) attachRecurring(s, byId.getOrDefault(s.getId(), java.util.List.of()));
        }
        return list;
    }

    @PostMapping("/businesses/{businessId}/recurring-invoices")
    public BusinessRecurringInvoice createRecurring(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        BusinessRecurringInvoice s = new BusinessRecurringInvoice();
        s.setUserId(userId());
        s.setBusinessId(businessId);
        applyRecurringFields(s, body, businessId);
        if (s.getCustomer() == null || s.getCustomer().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "customer is required");
        }
        if (s.getFrequency() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "frequency is required");
        if (s.getStartDate() == null) s.setStartDate(LocalDate.now());
        if (s.getNextRunDate() == null) s.setNextRunDate(s.getStartDate());
        if (s.getStatus() == null) s.setStatus("ACTIVE");
        List<BusinessRecurringInvoiceItem> parsed = parseRecurringItems(s, body);
        BusinessRecurringInvoice saved = recurringRepo.save(s);
        persistRecurringItems(saved, parsed);
        return saved;
    }

    @PutMapping("/recurring-invoices/{id}")
    public BusinessRecurringInvoice updateRecurring(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        BusinessRecurringInvoice s = recurringRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        applyRecurringFields(s, body, s.getBusinessId());
        List<BusinessRecurringInvoiceItem> parsed = parseRecurringItems(s, body);
        BusinessRecurringInvoice saved = recurringRepo.save(s);
        persistRecurringItems(saved, parsed);
        return saved;
    }

    @DeleteMapping("/recurring-invoices/{id}")
    public ResponseEntity<Void> deleteRecurring(@PathVariable Long id) {
        BusinessRecurringInvoice s = recurringRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        recurringRepo.delete(s); // items cascade at DB
        return ResponseEntity.noContent().build();
    }

    /** Generate an invoice from this schedule right now (also advances its next run date). */
    @PostMapping("/recurring-invoices/{id}/run")
    public BusinessInvoice runRecurring(@PathVariable Long id) {
        BusinessRecurringInvoice s = recurringRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!"ACTIVE".equals(s.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only active schedules can generate invoices.");
        }
        return recurringService.generateOne(s, LocalDate.now());
    }

    private void applyRecurringFields(BusinessRecurringInvoice s, Map<String, Object> body, Long businessId) {
        if (body.containsKey("customer")) s.setCustomer(str(body.get("customer")));
        if (body.containsKey("customerEmail")) s.setCustomerEmail(str(body.get("customerEmail")));
        if (body.containsKey("customerPhone")) s.setCustomerPhone(str(body.get("customerPhone")));
        if (body.containsKey("frequency")) {
            String f = str(body.get("frequency"));
            s.setFrequency(f == null ? null : f.toUpperCase());
        }
        if (body.containsKey("intervalCount")) {
            Integer n = intVal(body.get("intervalCount"));
            s.setIntervalCount(n == null || n < 1 ? 1 : n);
        }
        if (body.containsKey("startDate")) s.setStartDate(date(body.get("startDate")));
        if (body.containsKey("endDate")) s.setEndDate(date(body.get("endDate")));
        if (body.containsKey("nextRunDate")) s.setNextRunDate(date(body.get("nextRunDate")));
        if (body.containsKey("dueDays")) {
            Integer d = intVal(body.get("dueDays"));
            s.setDueDays(d == null || d < 0 ? 0 : d);
        }
        if (body.containsKey("notes")) s.setNotes(str(body.get("notes")));
        if (body.containsKey("status")) {
            String st = str(body.get("status"));
            if (st != null) s.setStatus(st.toUpperCase());
        }
        if (body.containsKey("customerId")) {
            Long customerId = asLong(body.get("customerId"));
            if (customerId == null || customerId == 0L) {
                s.setCustomerId(null);
            } else {
                BusinessCustomer c = customerRepo.findByIdAndBusinessIdAndUserId(customerId, businessId, userId())
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown customer"));
                s.setCustomerId(c.getId());
                if (!body.containsKey("customer") || str(body.get("customer")) == null) s.setCustomer(c.getDisplayName());
                if (!body.containsKey("customerEmail") && s.getCustomerEmail() == null) s.setCustomerEmail(c.getEmail());
                if (!body.containsKey("customerPhone") && s.getCustomerPhone() == null) {
                    s.setCustomerPhone(c.getMobile() != null ? c.getMobile() : c.getPhone());
                }
            }
        }
    }

    /** Parses the template line items + discount/tax onto the schedule. */
    private List<BusinessRecurringInvoiceItem> parseRecurringItems(BusinessRecurringInvoice s, Map<String, Object> body) {
        if (body.containsKey("discountType")) {
            String d = str(body.get("discountType"));
            s.setDiscountType(d == null ? null : d.toUpperCase());
        }
        if (body.containsKey("discountValue")) s.setDiscountValue(money(body.get("discountValue")));
        if (body.containsKey("taxRate")) s.setTaxRate(money(body.get("taxRate")));
        if (!body.containsKey("lineItems")) return null;
        List<BusinessRecurringInvoiceItem> lines = new java.util.ArrayList<>();
        if (body.get("lineItems") instanceof List<?> list) {
            int pos = 0;
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                String desc = str(m.get("description"));
                java.math.BigDecimal qty = money(m.get("quantity"));
                java.math.BigDecimal price = money(m.get("unitPrice"));
                if (qty == null) qty = java.math.BigDecimal.ONE;
                if (price == null) price = java.math.BigDecimal.ZERO;
                if ((desc == null || desc.isBlank()) && price.signum() == 0) continue;
                if (desc == null || desc.isBlank()) desc = "Item";
                if (desc.length() > 500) desc = desc.substring(0, 500);
                BusinessRecurringInvoiceItem li = new BusinessRecurringInvoiceItem();
                li.setUserId(userId());
                li.setPosition(pos++);
                li.setDescription(desc);
                li.setQuantity(qty);
                li.setUnitPrice(price);
                li.setAmount(qty.multiply(price).setScale(2, java.math.RoundingMode.HALF_UP));
                lines.add(li);
            }
        }
        return lines;
    }

    private void persistRecurringItems(BusinessRecurringInvoice s, List<BusinessRecurringInvoiceItem> lines) {
        List<BusinessRecurringInvoiceItem> effective;
        if (lines == null) {
            effective = recurringItemRepo.findByScheduleIdOrderByPositionAsc(s.getId());
        } else {
            recurringItemRepo.deleteByScheduleId(s.getId());
            for (BusinessRecurringInvoiceItem li : lines) li.setScheduleId(s.getId());
            effective = recurringItemRepo.saveAll(lines);
        }
        attachRecurring(s, effective);
    }

    /** Attaches the template line items + computes the schedule's total for the UI. */
    private void attachRecurring(BusinessRecurringInvoice s, List<BusinessRecurringInvoiceItem> items) {
        s.setLineItems(items);
        java.math.BigDecimal subtotal = items.stream()
                .map(BusinessRecurringInvoiceItem::getAmount)
                .filter(a -> a != null)
                .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);
        s.setAmount(InvoiceMath.compute(subtotal, s.getDiscountType(), s.getDiscountValue(), s.getTaxRate()).total());
    }

    /* ---------------- Projects (progress / milestone invoicing) ---------------- */

    @GetMapping("/businesses/{businessId}/projects")
    public List<BusinessProject> listProjects(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<BusinessProject> projects = projectRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(businessId, userId());
        if (!projects.isEmpty()) {
            java.util.Map<Long, java.util.List<BusinessProjectMilestone>> byProject =
                    milestoneRepo.findByProjectIdInOrderByPositionAsc(projects.stream().map(BusinessProject::getId).toList())
                            .stream().collect(java.util.stream.Collectors.groupingBy(BusinessProjectMilestone::getProjectId));
            for (BusinessProject p : projects) attachProjectComputed(p, byProject.getOrDefault(p.getId(), java.util.List.of()));
        }
        return projects;
    }

    @PostMapping("/businesses/{businessId}/projects")
    public BusinessProject createProject(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        BusinessProject p = new BusinessProject();
        p.setUserId(userId());
        p.setBusinessId(businessId);
        applyProjectFields(p, body, businessId);
        if (p.getName() == null || p.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A project name is required");
        }
        if (p.getCustomer() == null || p.getCustomer().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "customer is required");
        }
        if (p.getStatus() == null) p.setStatus("ACTIVE");
        BusinessProject saved = projectRepo.save(p);
        attachProjectComputed(saved, java.util.List.of());
        return saved;
    }

    @PutMapping("/projects/{id}")
    public BusinessProject updateProject(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        BusinessProject p = projectRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        applyProjectFields(p, body, p.getBusinessId());
        BusinessProject saved = projectRepo.save(p);
        attachProjectComputed(saved, milestoneRepo.findByProjectIdOrderByPositionAsc(saved.getId()));
        return saved;
    }

    @DeleteMapping("/projects/{id}")
    public ResponseEntity<Void> deleteProject(@PathVariable Long id) {
        BusinessProject p = projectRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        projectRepo.delete(p); // milestones cascade at DB; generated invoices are kept
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/projects/{projectId}/milestones")
    public BusinessProjectMilestone addMilestone(@PathVariable Long projectId, @RequestBody Map<String, Object> body) {
        BusinessProject p = projectRepo.findByIdAndUserId(projectId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        BusinessProjectMilestone m = new BusinessProjectMilestone();
        m.setUserId(userId());
        m.setProjectId(p.getId());
        int next = milestoneRepo.findByProjectIdOrderByPositionAsc(p.getId()).size();
        m.setPosition(next);
        applyMilestoneFields(m, body, p);
        if (m.getName() == null || m.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A milestone name is required");
        }
        return milestoneRepo.save(m);
    }

    @PutMapping("/milestones/{id}")
    public BusinessProjectMilestone updateMilestone(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        BusinessProjectMilestone m = milestoneRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if ("INVOICED".equalsIgnoreCase(m.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This milestone has been invoiced and can't be edited.");
        }
        BusinessProject p = projectRepo.findByIdAndUserId(m.getProjectId(), userId()).orElse(null);
        applyMilestoneFields(m, body, p);
        return milestoneRepo.save(m);
    }

    @DeleteMapping("/milestones/{id}")
    public ResponseEntity<Void> deleteMilestone(@PathVariable Long id) {
        BusinessProjectMilestone m = milestoneRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        milestoneRepo.delete(m);
        return ResponseEntity.noContent().build();
    }

    /** Bill a milestone: materialize an invoice for its amount and mark it INVOICED. */
    @PostMapping("/milestones/{id}/bill")
    @Transactional
    public BusinessInvoice billMilestone(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        BusinessProjectMilestone m = milestoneRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if ("INVOICED".equalsIgnoreCase(m.getStatus()) && m.getInvoiceId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This milestone has already been billed.");
        }
        BusinessProject p = projectRepo.findByIdAndUserId(m.getProjectId(), userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        Map<String, Object> b = body == null ? Map.of() : body;

        BigDecimal amount = m.getAmount() == null ? BigDecimal.ZERO : m.getAmount();
        BusinessInvoice inv = new BusinessInvoice();
        inv.setUserId(userId());
        inv.setBusinessId(p.getBusinessId());
        inv.setCustomerId(p.getCustomerId());
        inv.setCustomer(p.getCustomer());
        inv.setCustomerEmail(p.getCustomerEmail());
        inv.setCustomerPhone(p.getCustomerPhone());
        inv.setStatus("OPEN");
        inv.setIssuedAt(LocalDate.now());
        inv.setDueDate(b.containsKey("dueDate") ? date(b.get("dueDate")) : m.getDueDate());
        inv.setNotes(p.getName() + " — " + m.getName());
        inv.setSubtotal(amount);
        inv.setAmount(amount);
        BusinessInvoice saved = invoiceRepo.save(inv);

        BusinessInvoiceLineItem li = new BusinessInvoiceLineItem();
        li.setInvoiceId(saved.getId());
        li.setUserId(userId());
        li.setPosition(0);
        li.setDescription(p.getName() + " — " + m.getName());
        li.setQuantity(BigDecimal.ONE);
        li.setUnitPrice(amount);
        li.setAmount(amount);
        saved.setLineItems(lineItemRepo.saveAll(java.util.List.of(li)));

        m.setStatus("INVOICED");
        m.setInvoiceId(saved.getId());
        milestoneRepo.save(m);

        notificationClient.notify(userId(), "BUSINESS", "Milestone invoiced",
                "\"" + m.getName() + "\" on " + p.getName() + " was billed to " + saved.getCustomer()
                        + " for " + usd(amount) + ".");
        return saved;
    }

    private void applyProjectFields(BusinessProject p, Map<String, Object> body, Long businessId) {
        if (body.containsKey("name")) p.setName(str(body.get("name")));
        if (body.containsKey("customer")) p.setCustomer(str(body.get("customer")));
        if (body.containsKey("customerEmail")) p.setCustomerEmail(str(body.get("customerEmail")));
        if (body.containsKey("customerPhone")) p.setCustomerPhone(str(body.get("customerPhone")));
        if (body.containsKey("contractTotal")) p.setContractTotal(nonNeg(money(body.get("contractTotal"))));
        if (body.containsKey("notes")) p.setNotes(str(body.get("notes")));
        if (body.containsKey("status")) {
            String s = str(body.get("status"));
            if (s != null) p.setStatus(s.toUpperCase());
        }
        if (body.containsKey("customerId")) {
            Long customerId = asLong(body.get("customerId"));
            if (customerId == null || customerId == 0L) {
                p.setCustomerId(null);
            } else {
                BusinessCustomer c = customerRepo.findByIdAndBusinessIdAndUserId(customerId, businessId, userId())
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown customer"));
                p.setCustomerId(c.getId());
                if (!body.containsKey("customer") || str(body.get("customer")) == null) p.setCustomer(c.getDisplayName());
                if (!body.containsKey("customerEmail") && p.getCustomerEmail() == null) p.setCustomerEmail(c.getEmail());
                if (!body.containsKey("customerPhone") && p.getCustomerPhone() == null) {
                    p.setCustomerPhone(c.getMobile() != null ? c.getMobile() : c.getPhone());
                }
            }
        }
    }

    /** Applies milestone fields; a {@code percent} (of the project's contract) sets the amount. */
    private void applyMilestoneFields(BusinessProjectMilestone m, Map<String, Object> body, BusinessProject project) {
        if (body.containsKey("name")) m.setName(str(body.get("name")));
        if (body.containsKey("dueDate")) m.setDueDate(date(body.get("dueDate")));
        if (body.containsKey("position")) {
            Integer pos = intVal(body.get("position"));
            if (pos != null && pos >= 0) m.setPosition(pos);
        }
        // percent (of contract) takes precedence over an explicit amount when supplied.
        if (body.containsKey("percent") && str(body.get("percent")) != null) {
            BigDecimal pct = money(body.get("percent"));
            m.setPercent(pct);
            BigDecimal contract = project != null && project.getContractTotal() != null ? project.getContractTotal() : BigDecimal.ZERO;
            if (pct != null) {
                m.setAmount(contract.multiply(pct).divide(InvoiceMath.HUNDRED, 2, java.math.RoundingMode.HALF_UP));
            }
        } else if (body.containsKey("amount")) {
            m.setAmount(nonNeg(money(body.get("amount"))));
            m.setPercent(null);
        }
    }

    /** Attaches milestones and computes billed-to-date / remaining for the UI. */
    private void attachProjectComputed(BusinessProject p, List<BusinessProjectMilestone> milestones) {
        p.setMilestones(milestones);
        BigDecimal billed = milestones.stream()
                .filter(m -> "INVOICED".equalsIgnoreCase(m.getStatus()))
                .map(BusinessProjectMilestone::getAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        p.setBilledToDate(billed);
        BigDecimal contract = p.getContractTotal() == null ? BigDecimal.ZERO : p.getContractTotal();
        p.setRemaining(contract.subtract(billed));
    }

    /* ---------------- Invoices ---------------- */

    @GetMapping("/businesses/{businessId}/invoices")
    public List<BusinessInvoice> listInvoices(@PathVariable Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<BusinessInvoice> invoices = invoiceRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(businessId, userId());
        attachLineItems(invoices);
        return invoices;
    }

    /** Batch-loads and attaches line items to a set of invoices (single query). */
    private void attachLineItems(List<BusinessInvoice> invoices) {
        if (invoices.isEmpty()) return;
        java.util.Map<Long, java.util.List<BusinessInvoiceLineItem>> byInvoice =
                lineItemRepo.findByInvoiceIdInOrderByPositionAsc(invoices.stream().map(BusinessInvoice::getId).toList())
                        .stream().collect(java.util.stream.Collectors.groupingBy(BusinessInvoiceLineItem::getInvoiceId));
        for (BusinessInvoice inv : invoices) {
            inv.setLineItems(byInvoice.getOrDefault(inv.getId(), java.util.List.of()));
        }
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
        resolveInvoiceCustomer(inv, businessId, body);
        // Sales tax: auto-apply the rate for the customer's location unless the caller set one.
        if (!body.containsKey("taxRate") && inv.getCustomerId() != null) {
            java.math.BigDecimal auto = resolvedTaxRate(businessId, inv.getCustomerId());
            if (auto != null) inv.setTaxRate(auto);
        }
        // Compute totals from line items when present; sets inv.amount to the grand total.
        List<BusinessInvoiceLineItem> parsedLines = applyLineItemsAndTotals(inv, body);
        if (inv.getCustomer() == null || inv.getCustomer().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "customer is required");
        }
        if (inv.getAmount() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "amount is required");
        }
        if (inv.getStatus() == null) inv.setStatus("OPEN");
        if (inv.getIssuedAt() == null) inv.setIssuedAt(LocalDate.now());
        BusinessInvoice saved = invoiceRepo.save(inv);
        persistLineItems(saved, parsedLines);
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
        if (body.containsKey("customerId")) resolveInvoiceCustomer(inv, inv.getBusinessId(), body);
        // Recompute totals when the request re-sends line items / discount / tax; else leave
        // the money breakdown as-is (status-only and contact updates keep the existing total).
        List<BusinessInvoiceLineItem> parsedLines = applyLineItemsAndTotals(inv, body);
        BusinessInvoice saved = invoiceRepo.save(inv);
        persistLineItems(saved, parsedLines);
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

    /**
     * When the request carries a {@code customerId}, links the invoice to that saved
     * customer and back-fills the inline snapshot ({@code customer} / email / phone) from
     * it wherever the request did not supply an explicit override. The inline fields stay
     * the render source of truth so the public invoice is stable even if the customer is
     * later edited or archived. A {@code customerId} of null/0 detaches any existing link.
     */
    private void resolveInvoiceCustomer(BusinessInvoice inv, Long businessId, Map<String, Object> body) {
        Long customerId = asLong(body.get("customerId"));
        if (customerId == null || customerId == 0L) {
            inv.setCustomerId(null);
            return;
        }
        BusinessCustomer c = customerRepo.findByIdAndBusinessIdAndUserId(customerId, businessId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown customer"));
        inv.setCustomerId(c.getId());
        if (!body.containsKey("customer") || str(body.get("customer")) == null) inv.setCustomer(c.getDisplayName());
        if (!body.containsKey("customerEmail") && inv.getCustomerEmail() == null) inv.setCustomerEmail(c.getEmail());
        if (!body.containsKey("customerPhone") && inv.getCustomerPhone() == null) {
            inv.setCustomerPhone(c.getMobile() != null ? c.getMobile() : c.getPhone());
        }
    }

    private Long asLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.valueOf(String.valueOf(o).trim()); } catch (RuntimeException e) { return null; }
    }

    /**
     * When the request carries a {@code lineItems} array, parses the lines and recomputes
     * the invoice money breakdown (subtotal → discount → tax → grand total), writing the
     * grand total into {@link BusinessInvoice#getAmount()}. Discount ({@code discountType}
     * AMOUNT|PERCENT + {@code discountValue}) and {@code taxRate} default to the invoice's
     * current values when omitted. Returns the parsed (unsaved) line items to persist, or
     * {@code null} when the request has no {@code lineItems} key (money fields untouched —
     * e.g. a status-only or contact update on a one-off invoice).
     */
    private List<BusinessInvoiceLineItem> applyLineItemsAndTotals(BusinessInvoice inv, Map<String, Object> body) {
        if (!body.containsKey("lineItems")) return null;
        List<BusinessInvoiceLineItem> lines = new java.util.ArrayList<>();
        java.math.BigDecimal subtotal = java.math.BigDecimal.ZERO;
        if (body.get("lineItems") instanceof List<?> list) {
            int pos = 0;
            for (Object o : list) {
                if (!(o instanceof Map<?, ?> m)) continue;
                String desc = str(m.get("description"));
                java.math.BigDecimal qty = money(m.get("quantity"));
                java.math.BigDecimal price = money(m.get("unitPrice"));
                if (qty == null) qty = java.math.BigDecimal.ONE;
                if (price == null) price = java.math.BigDecimal.ZERO;
                // Skip genuinely empty rows (no description and no price).
                if ((desc == null || desc.isBlank()) && price.signum() == 0) continue;
                if (desc == null || desc.isBlank()) desc = "Item";
                if (desc.length() > 500) desc = desc.substring(0, 500);
                java.math.BigDecimal amt = qty.multiply(price).setScale(2, java.math.RoundingMode.HALF_UP);
                BusinessInvoiceLineItem li = new BusinessInvoiceLineItem();
                li.setUserId(userId());
                li.setPosition(pos++);
                li.setDescription(desc);
                li.setQuantity(qty);
                li.setUnitPrice(price);
                li.setAmount(amt);
                lines.add(li);
                subtotal = subtotal.add(amt);
            }
        }
        String discType = body.containsKey("discountType")
                ? (str(body.get("discountType")) == null ? null : str(body.get("discountType")).toUpperCase())
                : inv.getDiscountType();
        java.math.BigDecimal discVal = body.containsKey("discountValue") ? money(body.get("discountValue")) : inv.getDiscountValue();
        java.math.BigDecimal taxRate = body.containsKey("taxRate") ? money(body.get("taxRate")) : inv.getTaxRate();

        InvoiceMath.Breakdown b = InvoiceMath.compute(subtotal, discType, discVal, taxRate);
        inv.setSubtotal(b.subtotal());
        inv.setDiscountType(b.discountType());
        inv.setDiscountValue(b.discountValue());
        inv.setDiscountAmount(b.discountAmount());
        inv.setTaxRate(b.taxRate());
        inv.setTaxAmount(b.taxAmount());
        inv.setAmount(b.total());
        return lines;
    }

    /**
     * Replaces an invoice's persisted line items with {@code lines} (delete-then-insert) and
     * attaches them to the invoice for the response. A {@code null} argument means the caller
     * did not touch line items, so existing rows are loaded and attached unchanged.
     */
    private void persistLineItems(BusinessInvoice inv, List<BusinessInvoiceLineItem> lines) {
        if (lines == null) {
            inv.setLineItems(lineItemRepo.findByInvoiceIdOrderByPositionAsc(inv.getId()));
            return;
        }
        lineItemRepo.deleteByInvoiceId(inv.getId());
        for (BusinessInvoiceLineItem li : lines) li.setInvoiceId(inv.getId());
        List<BusinessInvoiceLineItem> saved = lineItemRepo.saveAll(lines);
        inv.setLineItems(saved);
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
        // Advance the lifecycle: a DRAFT/OPEN invoice becomes SENT once delivered. Don't
        // downgrade an already-viewed/paid/overdue invoice on a re-send.
        String st = inv.getStatus() == null ? "" : inv.getStatus().toUpperCase();
        if (st.equals("DRAFT") || st.equals("OPEN") || st.isEmpty()) {
            inv.setStatus("SENT");
        }
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
        java.math.BigDecimal total = inv.getAmount() == null ? java.math.BigDecimal.ZERO : inv.getAmount();
        // paidAmount is the cumulative total received; default to full when omitted.
        java.math.BigDecimal paid = money(body.get("paidAmount"));
        if (paid == null) paid = total;
        if (paid.signum() < 0) paid = java.math.BigDecimal.ZERO;
        inv.setPaidAmount(paid);
        inv.setPaymentMethod(str(body.get("paymentMethod")));
        inv.setPaymentReference(str(body.get("paymentReference")));
        Long txId = longVal(body.get("linkedTransactionId"));
        if (txId != null) {
            // Ensure the transaction belongs to the caller before linking.
            transactionRepo.findByIdAndUserId(txId, userId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "linked transaction not found"));
            inv.setLinkedTransactionId(txId);
        }
        boolean fullyPaid = paid.compareTo(total) >= 0 && total.signum() > 0 || (total.signum() == 0 && paid.signum() == 0);
        boolean wasPaid = "PAID".equalsIgnoreCase(inv.getStatus());
        if (fullyPaid) {
            inv.setStatus("PAID");
            inv.setPaidAt(date(body.get("paidAt")) != null ? date(body.get("paidAt")) : LocalDate.now());
        } else if (paid.signum() > 0) {
            inv.setStatus("PARTIALLY_PAID");
            inv.setPaidAt(null);
        }
        BusinessInvoice saved = invoiceRepo.save(inv);
        if (fullyPaid && !wasPaid) {
            notificationClient.notify(userId(), "BUSINESS", "Payment received",
                    saved.getCustomer() + " paid " + usd(saved.getPaidAmount()) + ". Invoice marked paid.");
        } else if (!fullyPaid && paid.signum() > 0) {
            notificationClient.notify(userId(), "BUSINESS", "Partial payment received",
                    saved.getCustomer() + " paid " + usd(paid) + " of " + usd(total) + ". "
                            + usd(total.subtract(paid)) + " remaining.");
        }
        return saved;
    }

    /**
     * Void an invoice (cancel it without deleting — it drops out of AR). Refused once an
     * invoice has any payment; use a credit/refund flow for that instead.
     */
    @PostMapping("/invoices/{id}/void")
    public BusinessInvoice voidInvoice(@PathVariable Long id) {
        BusinessInvoice inv = invoiceRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if ("PAID".equalsIgnoreCase(inv.getStatus())
                || (inv.getPaidAmount() != null && inv.getPaidAmount().signum() > 0)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A paid invoice can't be voided.");
        }
        inv.setStatus("VOID");
        return invoiceRepo.save(inv);
    }

    /**
     * Unauthenticated beacon: the customer opened the public invoice page. Records the first
     * view time and moves a SENT/DELIVERED/OPEN invoice to VIEWED (never downgrading a
     * paid/partially-paid/void invoice). Returns 204.
     */
    @PostMapping("/invoices/public/{token}/viewed")
    public ResponseEntity<Void> markViewed(@PathVariable String token) {
        BusinessInvoice inv = invoiceRepo.findByShareToken(token).orElse(null);
        if (inv != null) {
            boolean changed = false;
            if (inv.getViewedAt() == null) { inv.setViewedAt(java.time.LocalDateTime.now()); changed = true; }
            String st = inv.getStatus() == null ? "" : inv.getStatus().toUpperCase();
            if (st.equals("SENT") || st.equals("DELIVERED") || st.equals("OPEN")) {
                inv.setStatus("VIEWED");
                changed = true;
            }
            if (changed) invoiceRepo.save(inv);
        }
        return ResponseEntity.noContent().build();
    }

    /**
     * Start a "Pay Now" checkout for the public invoice. Body: { method: CARD|ACH|ECHECK }.
     * Returns the hosted-checkout URL to redirect the customer to, plus the attempt ref.
     * Unauthenticated + token-scoped (the token is the secret).
     */
    @PostMapping("/invoices/public/{token}/pay")
    public Map<String, Object> startInvoicePayment(@PathVariable String token, @RequestBody(required = false) Map<String, Object> body) {
        BusinessInvoice inv = invoiceRepo.findByShareToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice not found"));
        String st = inv.getStatus() == null ? "" : inv.getStatus().toUpperCase();
        if (st.equals("PAID")) throw new ResponseStatusException(HttpStatus.CONFLICT, "This invoice is already paid.");
        if (st.equals("VOID")) throw new ResponseStatusException(HttpStatus.CONFLICT, "This invoice was voided.");
        if (inv.getAmount() == null || inv.getAmount().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nothing to pay on this invoice.");
        }
        String method = payMethod(body == null ? null : body.get("method"));
        String base = webUrl == null || webUrl.isBlank() ? "" : webUrl;
        com.mywealthmanagement.businessfinancialsservice.business.pay.InvoicePaymentProvider.Checkout c =
                paymentProvider.createCheckout(inv, method, base);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("checkoutUrl", c.url());
        out.put("ref", c.ref());
        out.put("provider", c.provider());
        out.put("method", method);
        out.put("live", paymentProvider.live());
        return out;
    }

    /**
     * Confirm a returned "Pay Now" attempt. Body: { ref, method? }. Verifies with the
     * processor and, when paid, marks the invoice PAID + records the payment (auto-reconcile).
     */
    @PostMapping("/invoices/public/{token}/pay/confirm")
    public Map<String, Object> confirmInvoicePayment(@PathVariable String token, @RequestBody Map<String, Object> body) {
        BusinessInvoice inv = invoiceRepo.findByShareToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice not found"));
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        if ("PAID".equalsIgnoreCase(inv.getStatus())) {
            out.put("status", "PAID");
            out.put("paid", true);
            return out;
        }
        String ref = str(body.get("ref"));
        boolean paid = paymentProvider.verifyPaid(ref, inv);
        if (paid) {
            inv.setPaidAmount(inv.getAmount());
            inv.setPaidAt(LocalDate.now());
            inv.setStatus("PAID");
            inv.setPaymentMethod(payMethodLabel(payMethod(body.get("method"))));
            inv.setPaymentReference(ref);
            invoiceRepo.save(inv);
            notificationClient.notify(inv.getUserId(), "BUSINESS", "Payment received",
                    inv.getCustomer() + " paid " + usd(inv.getAmount()) + " online. Invoice marked paid.");
        }
        out.put("status", inv.getStatus());
        out.put("paid", paid);
        return out;
    }

    /** CARD | ACH | ECHECK, defaulting to CARD. */
    private String payMethod(Object o) {
        String s = str(o);
        if (s == null) return "CARD";
        s = s.toUpperCase();
        return (s.equals("ACH") || s.equals("ECHECK")) ? s : "CARD";
    }
    private String payMethodLabel(String method) {
        return switch (method) {
            case "ACH" -> "Bank transfer (ACH)";
            case "ECHECK" -> "e-Check";
            default -> "Card";
        };
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
        // Itemized breakdown for the public page (empty list when the invoice isn't itemized).
        m.put("lineItems", lineItemRepo.findByInvoiceIdOrderByPositionAsc(inv.getId()));
        m.put("subtotal", inv.getSubtotal());
        m.put("discountType", inv.getDiscountType());
        m.put("discountAmount", inv.getDiscountAmount());
        m.put("taxRate", inv.getTaxRate());
        m.put("taxAmount", inv.getTaxAmount());
        m.put("status", inv.getStatus());
        m.put("issuedAt", inv.getIssuedAt());
        m.put("dueDate", inv.getDueDate());
        m.put("notes", inv.getNotes());
        m.put("payInstructions", inv.getPayInstructions());
        m.put("paidAt", inv.getPaidAt());
        m.put("paidAmount", inv.getPaidAmount());
        m.put("viewedAt", inv.getViewedAt());
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
