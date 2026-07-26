package com.mywealthmanagement.businessfinancialsservice.ledger;

import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessInvoice;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Translates order-to-cash events into balanced journal entries (GL.2). Each posting is
 * idempotent — keyed on (source_type, source_ref) — so the many invoice code paths can call
 * it freely without ever double-posting. Best-effort: a posting failure is logged, never
 * allowed to break the invoice operation itself (the ledger reconciles separately in GL.3).
 *
 * <p>Account codes come from the seeded {@link ChartOfAccounts}:
 * 1000 Cash · 1100 Accounts Receivable · 2200 Sales Tax Payable · 4000 Sales Income.
 */
@Service
@RequiredArgsConstructor
public class LedgerPostingService {

    private static final Logger log = LoggerFactory.getLogger(LedgerPostingService.class);

    private static final String SRC_INVOICE = "INVOICE";
    private static final String SRC_PAYMENT = "PAYMENT";

    private final LedgerService ledger;
    private final JournalEntryRepository entryRepo;

    /**
     * Invoice issued (it left DRAFT / became receivable):
     *   DR 1100 Accounts Receivable   = total
     *   CR 4000 Sales Income          = net revenue (total − tax)
     *   CR 2200 Sales Tax Payable     = tax (if any)
     */
    public void postInvoiceIssued(BusinessInvoice inv) {
        if (!postable(inv)) return;
        String ref = String.valueOf(inv.getId());
        try {
            if (entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(inv.getBusinessId(), SRC_INVOICE, ref)) return;
            BigDecimal total = nz(inv.getAmount());
            if (total.signum() <= 0) return;
            BigDecimal tax = nz(inv.getTaxAmount());
            BigDecimal revenue = total.subtract(tax);

            List<LedgerService.LineInput> lines = new ArrayList<>();
            lines.add(new LedgerService.LineInput("1100", total, null, "Invoice to " + inv.getCustomer()));
            lines.add(new LedgerService.LineInput("4000", null, revenue, "Sales income"));
            if (tax.signum() > 0) lines.add(new LedgerService.LineInput("2200", null, tax, "Sales tax"));

            ledger.post(inv.getBusinessId(), inv.getUserId(),
                    inv.getIssuedAt() != null ? inv.getIssuedAt() : LocalDate.now(),
                    "Invoice #" + (inv.getInvoiceNumber() != null ? inv.getInvoiceNumber() : inv.getId())
                            + " — " + inv.getCustomer(),
                    SRC_INVOICE, ref, lines);
        } catch (RuntimeException e) {
            log.warn("ledger: failed to post issuance for invoice {}: {}", inv.getId(), e.getMessage());
        }
    }

    /**
     * Invoice paid in full:
     *   DR 1000 Cash                  = amount
     *   CR 1100 Accounts Receivable   = amount
     * Posts the issuance first if it wasn't (e.g. a directly-paid invoice).
     */
    public void postInvoicePaid(BusinessInvoice inv) {
        if (inv == null || inv.getId() == null) return;
        if (!"PAID".equalsIgnoreCase(inv.getStatus())) return;
        String ref = String.valueOf(inv.getId());
        try {
            postInvoiceIssued(inv); // ensure AR exists to relieve
            if (entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(inv.getBusinessId(), SRC_PAYMENT, ref)) return;
            BigDecimal paid = inv.getPaidAmount() != null ? inv.getPaidAmount() : nz(inv.getAmount());
            if (paid.signum() <= 0) return;
            List<LedgerService.LineInput> lines = List.of(
                    new LedgerService.LineInput("1000", paid, null, "Payment received"),
                    new LedgerService.LineInput("1100", null, paid, "Clear receivable"));
            ledger.post(inv.getBusinessId(), inv.getUserId(),
                    inv.getPaidAt() != null ? inv.getPaidAt() : LocalDate.now(),
                    "Payment — invoice #" + (inv.getInvoiceNumber() != null ? inv.getInvoiceNumber() : inv.getId()),
                    SRC_PAYMENT, ref, lines);
        } catch (RuntimeException e) {
            log.warn("ledger: failed to post payment for invoice {}: {}", inv.getId(), e.getMessage());
        }
    }

    /** Invoice voided — reverse its issuance entry (if it was posted and not already reversed). */
    public void postInvoiceVoided(BusinessInvoice inv) {
        if (inv == null || inv.getId() == null) return;
        String ref = String.valueOf(inv.getId());
        try {
            entryRepo.findFirstByBusinessIdAndSourceTypeAndSourceRefOrderByIdAsc(inv.getBusinessId(), SRC_INVOICE, ref)
                    .ifPresent(issuance -> {
                        if (!entryRepo.existsByBusinessIdAndReversalOf(inv.getBusinessId(), issuance.getId())) {
                            ledger.reverse(inv.getBusinessId(), inv.getUserId(), issuance.getId(), LocalDate.now(),
                                    "Void of invoice #" + (inv.getInvoiceNumber() != null ? inv.getInvoiceNumber() : inv.getId()));
                        }
                    });
        } catch (RuntimeException e) {
            log.warn("ledger: failed to void invoice {}: {}", inv.getId(), e.getMessage());
        }
    }

    /** An invoice is postable once it's real (not DRAFT/VOID) and has an amount. */
    private boolean postable(BusinessInvoice inv) {
        if (inv == null || inv.getId() == null) return false;
        String st = inv.getStatus() == null ? "" : inv.getStatus().toUpperCase();
        return !st.equals("DRAFT") && !st.equals("VOID");
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
