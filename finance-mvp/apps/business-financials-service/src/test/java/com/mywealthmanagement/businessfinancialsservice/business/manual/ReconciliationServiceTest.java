package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.ledger.LedgerPostingService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** One-click reconciliation matching + confirm (Phase 3b). */
@ExtendWith(MockitoExtension.class)
class ReconciliationServiceTest {

    private static final long USER = 1L;
    private static final long BIZ = 7L;

    @Mock private BusinessTransactionRepository txnRepo;
    @Mock private BusinessInvoiceRepository invoiceRepo;
    @Mock private BusinessBillRepository billRepo;
    @Mock private LedgerPostingService ledgerPosting;
    @InjectMocks private ReconciliationService service;

    private BusinessTransaction txn(long id, String amount, LocalDate date, String desc) {
        BusinessTransaction t = new BusinessTransaction();
        t.setId(id); t.setUserId(USER); t.setBusinessId(BIZ);
        t.setAmount(new BigDecimal(amount)); t.setPostedAt(date); t.setDescription(desc);
        return t;
    }
    private BusinessInvoice invoice(long id, String amount, String status, LocalDate due) {
        BusinessInvoice i = new BusinessInvoice();
        i.setId(id); i.setUserId(USER); i.setBusinessId(BIZ); i.setCustomer("Acme");
        i.setAmount(new BigDecimal(amount)); i.setStatus(status); i.setDueDate(due);
        return i;
    }
    private BusinessBill bill(long id, String amount, String status, LocalDate due) {
        BusinessBill b = new BusinessBill();
        b.setId(id); b.setUserId(USER); b.setBusinessId(BIZ); b.setVendor("Supplier");
        b.setAmount(new BigDecimal(amount)); b.setStatus(status); b.setDueDate(due);
        return b;
    }

    @Test
    void suggest_matchesDepositToInvoiceAndWithdrawalToBill() {
        when(invoiceRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(BIZ, USER))
                .thenReturn(List.of(invoice(100, "500.00", "SENT", LocalDate.of(2026, 7, 20)),
                        invoice(101, "999.00", "SENT", LocalDate.of(2026, 7, 20))));
        when(billRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(BIZ, USER))
                .thenReturn(List.of(bill(200, "300.00", "OPEN", LocalDate.of(2026, 7, 25))));
        when(txnRepo.findByBusinessIdAndUserIdOrderByPostedAtDescIdDesc(BIZ, USER))
                .thenReturn(List.of(
                        txn(1, "500.00", LocalDate.of(2026, 7, 21), "Deposit from Acme"),
                        txn(2, "-300.00", LocalDate.of(2026, 7, 26), "ACH Supplier"),
                        txn(3, "42.00", LocalDate.of(2026, 7, 26), "No match")));

        List<Map<String, Object>> s = service.suggest(BIZ, USER);

        assertThat(s).hasSize(2);
        assertThat(s.get(0)).containsEntry("type", "INVOICE").containsEntry("targetId", 100L);
        assertThat((BigDecimal) s.get(0).get("amount")).isEqualByComparingTo("500.00");
        assertThat(s.get(1)).containsEntry("type", "BILL").containsEntry("targetId", 200L);
    }

    @Test
    void suggest_skipsAlreadyLinkedTransactions() {
        BusinessInvoice paidLinked = invoice(100, "500.00", "PAID", null);
        paidLinked.setLinkedTransactionId(1L);
        when(invoiceRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(BIZ, USER)).thenReturn(List.of(paidLinked));
        when(billRepo.findByBusinessIdAndUserIdOrderByCreatedAtDesc(BIZ, USER)).thenReturn(List.of());
        when(txnRepo.findByBusinessIdAndUserIdOrderByPostedAtDescIdDesc(BIZ, USER))
                .thenReturn(List.of(txn(1, "500.00", LocalDate.now(), "already used")));

        assertThat(service.suggest(BIZ, USER)).isEmpty();
    }

    @Test
    void confirm_marksInvoicePaidLinksTxnAndPostsLedger() {
        BusinessInvoice inv = invoice(100, "500.00", "SENT", null);
        BusinessTransaction t = txn(1, "500.00", LocalDate.of(2026, 7, 21), "Deposit");
        when(txnRepo.findByIdAndUserId(1L, USER)).thenReturn(Optional.of(t));
        when(invoiceRepo.findByIdAndUserId(100L, USER)).thenReturn(Optional.of(inv));
        when(invoiceRepo.save(any(BusinessInvoice.class))).thenAnswer(i -> i.getArgument(0));

        Map<String, Object> res = service.confirm(BIZ, USER, 1L, "INVOICE", 100L);

        assertThat(res).containsEntry("status", "PAID");
        assertThat(inv.getStatus()).isEqualTo("PAID");
        assertThat(inv.getLinkedTransactionId()).isEqualTo(1L);
        assertThat(inv.getPaidAt()).isEqualTo(LocalDate.of(2026, 7, 21));
        verify(ledgerPosting).postInvoicePaid(inv);
    }

    @Test
    void confirm_marksBillPaidAndPostsLedger() {
        BusinessBill b = bill(200, "300.00", "OPEN", null);
        BusinessTransaction t = txn(2, "-300.00", LocalDate.of(2026, 7, 26), "ACH");
        when(txnRepo.findByIdAndUserId(2L, USER)).thenReturn(Optional.of(t));
        when(billRepo.findByIdAndUserId(200L, USER)).thenReturn(Optional.of(b));
        when(billRepo.save(any(BusinessBill.class))).thenAnswer(i -> i.getArgument(0));

        service.confirm(BIZ, USER, 2L, "BILL", 200L);

        assertThat(b.getStatus()).isEqualTo("PAID");
        assertThat(b.getLinkedTransactionId()).isEqualTo(2L);
        verify(ledgerPosting).postBillPaid(b);
    }
}
