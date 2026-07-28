package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.ledger.LedgerPostingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * One-click bank reconciliation (Phase 3b): matches a business's manual bank transactions to
 * its open invoices and bills by amount — deposits → open invoices, withdrawals → open bills —
 * and applies a confirmed match (records the payment + links the transaction + posts to the
 * ledger). One-to-one: each transaction and each invoice/bill is used at most once.
 */
@Service
@RequiredArgsConstructor
public class ReconciliationService {

    private final BusinessTransactionRepository txnRepo;
    private final BusinessInvoiceRepository invoiceRepo;
    private final BusinessBillRepository billRepo;
    private final LedgerPostingService ledgerPosting;

    private static BigDecimal outstanding(BigDecimal amount, BigDecimal paid) {
        BigDecimal a = amount == null ? BigDecimal.ZERO : amount;
        BigDecimal p = paid == null ? BigDecimal.ZERO : paid;
        return a.subtract(p).setScale(2, RoundingMode.HALF_UP);
    }
    private static boolean nonAr(String status) {
        String s = status == null ? "" : status.toUpperCase();
        return s.equals("PAID") || s.equals("VOID") || s.equals("DRAFT");
    }

    /** Suggested matches for the business's still-unlinked transactions. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> suggest(Long businessId, Long userId) {
        List<BusinessInvoice> invoices = invoiceRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(businessId, userId);
        List<BusinessBill> bills = billRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(businessId, userId);

        // Transactions already reconciled to an invoice or bill are off the table.
        Set<Long> used = new java.util.HashSet<>();
        invoices.forEach(i -> { if (i.getLinkedTransactionId() != null) used.add(i.getLinkedTransactionId()); });
        bills.forEach(b -> { if (b.getLinkedTransactionId() != null) used.add(b.getLinkedTransactionId()); });

        List<BusinessInvoice> openInvoices = invoices.stream()
                .filter(i -> !nonAr(i.getStatus()) && i.getLinkedTransactionId() == null && outstanding(i.getAmount(), i.getPaidAmount()).signum() > 0)
                .collect(Collectors.toList());
        List<BusinessBill> openBills = bills.stream()
                .filter(b -> !"PAID".equalsIgnoreCase(b.getStatus()) && !"VOID".equalsIgnoreCase(b.getStatus())
                        && b.getLinkedTransactionId() == null && outstanding(b.getAmount(), b.getPaidAmount()).signum() > 0)
                .collect(Collectors.toList());

        List<Map<String, Object>> out = new ArrayList<>();
        for (BusinessTransaction t : txnRepo.findByBusinessIdAndUserIdOrderByPostedAtDescIdDesc(businessId, userId)) {
            if (used.contains(t.getId()) || t.getAmount() == null) continue;
            BigDecimal amt = t.getAmount().setScale(2, RoundingMode.HALF_UP);
            if (amt.signum() > 0) {
                BusinessInvoice m = bestByAmount(openInvoices, amt, i -> outstanding(i.getAmount(), i.getPaidAmount()), i -> i.getDueDate(), t.getPostedAt());
                if (m != null) { openInvoices.remove(m); out.add(suggestion(t, "INVOICE", m.getId(), amt, m.getCustomer())); }
            } else if (amt.signum() < 0) {
                BigDecimal abs = amt.negate();
                BusinessBill m = bestByAmount(openBills, abs, b -> outstanding(b.getAmount(), b.getPaidAmount()), b -> b.getDueDate(), t.getPostedAt());
                if (m != null) { openBills.remove(m); out.add(suggestion(t, "BILL", m.getId(), abs, m.getVendor())); }
            }
        }
        return out;
    }

    private <T> T bestByAmount(List<T> pool, BigDecimal amount,
                               java.util.function.Function<T, BigDecimal> outstandingOf,
                               java.util.function.Function<T, LocalDate> dateOf, LocalDate txnDate) {
        T best = null;
        long bestGap = Long.MAX_VALUE;
        for (T item : pool) {
            if (outstandingOf.apply(item).compareTo(amount) != 0) continue;
            LocalDate d = dateOf.apply(item);
            long gap = (d == null || txnDate == null) ? 3650 : Math.abs(d.toEpochDay() - txnDate.toEpochDay());
            if (gap < bestGap) { bestGap = gap; best = item; }
        }
        return best;
    }

    private Map<String, Object> suggestion(BusinessTransaction t, String type, Long targetId, BigDecimal amount, String counterparty) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("transactionId", t.getId());
        m.put("transactionDate", t.getPostedAt());
        m.put("transactionDescription", t.getDescription() != null ? t.getDescription() : t.getMerchant());
        m.put("type", type);
        m.put("targetId", targetId);
        m.put("counterparty", counterparty);
        m.put("amount", amount);
        return m;
    }

    /** Applies a confirmed match: records the payment, links the transaction, posts to the ledger. */
    @Transactional
    public Map<String, Object> confirm(Long businessId, Long userId, Long transactionId, String type, Long targetId) {
        BusinessTransaction txn = txnRepo.findByIdAndUserId(transactionId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown transaction"));
        if (!txn.getBusinessId().equals(businessId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transaction is not in this business");
        }
        String t = type == null ? "" : type.toUpperCase();
        if (t.equals("INVOICE")) {
            BusinessInvoice inv = invoiceRepo.findByIdAndUserId(targetId, userId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice not found"));
            inv.setPaidAmount(inv.getAmount());
            inv.setStatus("PAID");
            inv.setPaidAt(txn.getPostedAt() != null ? txn.getPostedAt() : LocalDate.now());
            inv.setLinkedTransactionId(txn.getId());
            inv.setPaymentReference("Reconciled: " + safeDesc(txn));
            BusinessInvoice saved = invoiceRepo.save(inv);
            ledgerPosting.postInvoicePaid(saved);
            return Map.of("status", "PAID", "type", "INVOICE", "id", saved.getId());
        }
        if (t.equals("BILL")) {
            BusinessBill bill = billRepo.findByIdAndUserId(targetId, userId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bill not found"));
            bill.setPaidAmount(bill.getAmount());
            bill.setStatus("PAID");
            bill.setPaidAt(txn.getPostedAt() != null ? txn.getPostedAt() : LocalDate.now());
            bill.setLinkedTransactionId(txn.getId());
            bill.setPaymentReference("Reconciled: " + safeDesc(txn));
            BusinessBill saved = billRepo.save(bill);
            ledgerPosting.postBillPaid(saved);
            return Map.of("status", "PAID", "type", "BILL", "id", saved.getId());
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "type must be INVOICE or BILL");
    }

    private static String safeDesc(BusinessTransaction t) {
        String d = t.getDescription() != null ? t.getDescription() : t.getMerchant();
        return d == null ? "bank transaction" : d;
    }
}
