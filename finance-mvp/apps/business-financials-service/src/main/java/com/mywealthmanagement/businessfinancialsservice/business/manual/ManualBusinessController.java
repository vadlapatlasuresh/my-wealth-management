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
        return businessRepo.save(b);
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
        return invoiceRepo.save(inv);
    }

    /** Update an invoice's status (e.g. mark paid). Other fields optional. */
    @PutMapping("/invoices/{id}")
    public BusinessInvoice updateInvoice(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        BusinessInvoice inv = invoiceRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (body.containsKey("customer")) inv.setCustomer(str(body.get("customer")));
        if (body.containsKey("amount")) inv.setAmount(money(body.get("amount")));
        if (body.containsKey("status")) inv.setStatus(str(body.get("status")));
        if (body.containsKey("dueDate")) inv.setDueDate(date(body.get("dueDate")));
        return invoiceRepo.save(inv);
    }

    @DeleteMapping("/invoices/{id}")
    public ResponseEntity<Void> deleteInvoice(@PathVariable Long id) {
        BusinessInvoice inv = invoiceRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        invoiceRepo.delete(inv);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- helpers ---------------- */

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
