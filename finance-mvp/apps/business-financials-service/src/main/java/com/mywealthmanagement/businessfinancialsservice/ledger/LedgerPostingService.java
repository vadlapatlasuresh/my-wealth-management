package com.mywealthmanagement.businessfinancialsservice.ledger;

import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessBill;
import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessContractorPayment;
import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessInventoryItem;
import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessInventoryMovement;
import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessInvoice;
import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessPayrollRun;
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
    private static final String SRC_BILL = "BILL";
    private static final String SRC_BILL_PAYMENT = "BILL_PAYMENT";
    private static final String SRC_INV_MOVE = "INVENTORY_MOVE";
    private static final String SRC_CONTRACTOR_PAYMENT = "CONTRACTOR_PAYMENT";
    private static final String SRC_PAYROLL = "PAYROLL_RUN";

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

    /* ==================== Procure-to-Pay (bills / AP) ==================== */

    /**
     * Bill entered:
     *   DR &lt;expense account by category&gt; = amount
     *   CR 2000 Accounts Payable          = amount
     */
    public void postBillEntered(BusinessBill bill) {
        if (bill == null || bill.getId() == null) return;
        String st = bill.getStatus() == null ? "" : bill.getStatus().toUpperCase();
        if (st.equals("VOID")) return;
        String ref = String.valueOf(bill.getId());
        try {
            if (entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(bill.getBusinessId(), SRC_BILL, ref)) return;
            BigDecimal amount = nz(bill.getAmount());
            if (amount.signum() <= 0) return;
            String expenseCode = expenseAccountFor(bill.getExpenseCategory());
            List<LedgerService.LineInput> lines = List.of(
                    new LedgerService.LineInput(expenseCode, amount, null, "Bill from " + bill.getVendor()),
                    new LedgerService.LineInput("2000", null, amount, "Accounts payable"));
            ledger.post(bill.getBusinessId(), bill.getUserId(),
                    bill.getBillDate() != null ? bill.getBillDate() : LocalDate.now(),
                    "Bill" + (bill.getBillNumber() != null ? " #" + bill.getBillNumber() : "") + " — " + bill.getVendor(),
                    SRC_BILL, ref, lines);
        } catch (RuntimeException e) {
            log.warn("ledger: failed to post bill {}: {}", bill.getId(), e.getMessage());
        }
    }

    /**
     * Bill paid in full:
     *   DR 2000 Accounts Payable = amount
     *   CR 1000 Cash             = amount
     */
    public void postBillPaid(BusinessBill bill) {
        if (bill == null || bill.getId() == null) return;
        if (!"PAID".equalsIgnoreCase(bill.getStatus())) return;
        String ref = String.valueOf(bill.getId());
        try {
            postBillEntered(bill); // ensure AP exists to relieve
            if (entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(bill.getBusinessId(), SRC_BILL_PAYMENT, ref)) return;
            BigDecimal paid = bill.getPaidAmount() != null ? bill.getPaidAmount() : nz(bill.getAmount());
            if (paid.signum() <= 0) return;
            List<LedgerService.LineInput> lines = List.of(
                    new LedgerService.LineInput("2000", paid, null, "Pay accounts payable"),
                    new LedgerService.LineInput("1000", null, paid, "Cash paid to " + bill.getVendor()));
            ledger.post(bill.getBusinessId(), bill.getUserId(),
                    bill.getPaidAt() != null ? bill.getPaidAt() : LocalDate.now(),
                    "Bill payment — " + bill.getVendor(), SRC_BILL_PAYMENT, ref, lines);
        } catch (RuntimeException e) {
            log.warn("ledger: failed to post bill payment {}: {}", bill.getId(), e.getMessage());
        }
    }

    /** Bill voided — reverse its entry (if posted and not already reversed). */
    public void postBillVoided(BusinessBill bill) {
        if (bill == null || bill.getId() == null) return;
        String ref = String.valueOf(bill.getId());
        try {
            entryRepo.findFirstByBusinessIdAndSourceTypeAndSourceRefOrderByIdAsc(bill.getBusinessId(), SRC_BILL, ref)
                    .ifPresent(entered -> {
                        if (!entryRepo.existsByBusinessIdAndReversalOf(bill.getBusinessId(), entered.getId())) {
                            ledger.reverse(bill.getBusinessId(), bill.getUserId(), entered.getId(), LocalDate.now(),
                                    "Void of bill" + (bill.getBillNumber() != null ? " #" + bill.getBillNumber() : ""));
                        }
                    });
        } catch (RuntimeException e) {
            log.warn("ledger: failed to void bill {}: {}", bill.getId(), e.getMessage());
        }
    }

    /* ==================== Inventory / COGS (Phase 4) ==================== */

    /**
     * A stock movement, valued at cost. Keyed on the movement id so it posts exactly once.
     *   Stock in  (RECEIVE / positive ADJUST): DR 1200 Inventory / CR 5000 COGS (capitalize)
     *   Stock out (SELL / negative ADJUST):     DR 5000 COGS / CR 1200 Inventory (recognize)
     */
    public void postInventoryMovement(BusinessInventoryMovement m, BusinessInventoryItem item) {
        if (m == null || m.getId() == null || item == null) return;
        String ref = String.valueOf(m.getId());
        try {
            if (entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(m.getBusinessId(), SRC_INV_MOVE, ref)) return;
            BigDecimal unit = m.getUnitCost() != null ? m.getUnitCost() : nz(item.getCostPrice());
            BigDecimal amount = unit.multiply(BigDecimal.valueOf(Math.abs(m.getDelta())));
            if (amount.signum() <= 0) return;
            String label = (m.getKind() == null ? "Inventory" : m.getKind().charAt(0) + m.getKind().substring(1).toLowerCase())
                    + " — " + item.getName();
            List<LedgerService.LineInput> lines = m.getDelta() >= 0
                    ? List.of(new LedgerService.LineInput("1200", amount, null, "Inventory in — " + item.getName()),
                              new LedgerService.LineInput("5000", null, amount, "COGS adjustment"))
                    : List.of(new LedgerService.LineInput("5000", amount, null, "COGS — " + item.getName()),
                              new LedgerService.LineInput("1200", null, amount, "Inventory out"));
            ledger.post(m.getBusinessId(), m.getUserId(),
                    m.getCreatedAt() != null ? m.getCreatedAt().toLocalDate() : LocalDate.now(),
                    label, SRC_INV_MOVE, ref, lines);
        } catch (RuntimeException e) {
            log.warn("ledger: failed to post inventory movement {}: {}", m.getId(), e.getMessage());
        }
    }

    /* ==================== Payroll / 1099 (Phase 5) ==================== */

    /**
     * A 1099 contractor payment — contract labor, paid in cash:
     *   DR 6000 Operating Expenses = amount
     *   CR 1000 Cash               = amount
     * Keyed on the payment id (idempotent).
     */
    public void postContractorPayment(BusinessContractorPayment p, String contractorName) {
        if (p == null || p.getId() == null) return;
        String ref = String.valueOf(p.getId());
        try {
            if (entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(p.getBusinessId(), SRC_CONTRACTOR_PAYMENT, ref)) return;
            BigDecimal amt = nz(p.getAmount());
            if (amt.signum() <= 0) return;
            String who = contractorName != null ? contractorName : "contractor";
            List<LedgerService.LineInput> lines = List.of(
                    new LedgerService.LineInput("6000", amt, null, "Contract labor — " + who),
                    new LedgerService.LineInput("1000", null, amt, "Paid " + who));
            ledger.post(p.getBusinessId(), p.getUserId(),
                    p.getPaidAt() != null ? p.getPaidAt() : LocalDate.now(),
                    "Contractor payment — " + who, SRC_CONTRACTOR_PAYMENT, ref, lines);
        } catch (RuntimeException e) {
            log.warn("ledger: failed to post contractor payment {}: {}", p.getId(), e.getMessage());
        }
    }

    /**
     * An employee payroll run:
     *   DR 6100 Payroll Expense       = gross
     *   CR 2300 Payroll Liabilities   = withholdings (fed + state + FICA)
     *   CR 1000 Cash                  = net take-home
     * Keyed on the run id (idempotent).
     */
    public void postPayrollRun(BusinessPayrollRun r, String employeeName) {
        if (r == null || r.getId() == null) return;
        String ref = String.valueOf(r.getId());
        try {
            if (entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(r.getBusinessId(), SRC_PAYROLL, ref)) return;
            BigDecimal gross = nz(r.getGross());
            if (gross.signum() <= 0) return;
            BigDecimal withheld = nz(r.getFedWh()).add(nz(r.getStateWh())).add(nz(r.getFica()));
            BigDecimal net = nz(r.getNet());
            String who = employeeName != null ? employeeName : "employee";
            List<LedgerService.LineInput> lines = new ArrayList<>();
            lines.add(new LedgerService.LineInput("6100", gross, null, "Gross wages — " + who));
            if (withheld.signum() > 0) lines.add(new LedgerService.LineInput("2300", null, withheld, "Payroll withholdings"));
            lines.add(new LedgerService.LineInput("1000", null, net, "Net pay — " + who));
            ledger.post(r.getBusinessId(), r.getUserId(),
                    r.getPaidAt() != null ? r.getPaidAt() : LocalDate.now(),
                    "Payroll — " + who, SRC_PAYROLL, ref, lines);
        } catch (RuntimeException e) {
            log.warn("ledger: failed to post payroll run {}: {}", r.getId(), e.getMessage());
        }
    }

    /** Maps a free-text expense category to a seeded ledger expense account code. */
    private String expenseAccountFor(String category) {
        String c = category == null ? "" : category.toLowerCase();
        if (c.contains("cogs") || c.contains("cost of goods") || c.contains("inventory") || c.contains("materials")) return "5000";
        if (c.contains("payroll") || c.contains("wage") || c.contains("salar")) return "6100";
        if (c.contains("bank") || c.contains("merchant") || c.contains("fee") || c.contains("interest")) return "6200";
        return "6000"; // Operating Expenses
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
