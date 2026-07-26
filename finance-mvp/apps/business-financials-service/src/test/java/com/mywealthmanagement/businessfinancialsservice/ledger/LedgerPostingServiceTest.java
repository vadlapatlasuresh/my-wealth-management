package com.mywealthmanagement.businessfinancialsservice.ledger;

import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessInvoice;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Order-to-cash → journal-entry translation (GL.2): correct lines, idempotency, void reversal. */
@ExtendWith(MockitoExtension.class)
class LedgerPostingServiceTest {

    private static final long USER = 1L;
    private static final long BIZ = 7L;

    @Mock private LedgerService ledger;
    @Mock private JournalEntryRepository entryRepo;
    @InjectMocks private LedgerPostingService posting;

    @Captor private ArgumentCaptor<List<LedgerService.LineInput>> linesCaptor;

    private BusinessInvoice inv(String status, String amount, String tax, String paid) {
        BusinessInvoice i = new BusinessInvoice();
        i.setId(42L); i.setUserId(USER); i.setBusinessId(BIZ); i.setCustomer("Acme");
        i.setStatus(status); i.setAmount(new BigDecimal(amount));
        if (tax != null) i.setTaxAmount(new BigDecimal(tax));
        if (paid != null) i.setPaidAmount(new BigDecimal(paid));
        i.setIssuedAt(LocalDate.of(2026, 7, 26));
        return i;
    }

    private LedgerService.LineInput lineFor(List<LedgerService.LineInput> lines, String code) {
        return lines.stream().filter(l -> code.equals(l.accountCode())).findFirst().orElseThrow();
    }

    @Test
    void issuance_debitsARCreditsIncomeAndTax() {
        when(entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(BIZ, "INVOICE", "42")).thenReturn(false);

        posting.postInvoiceIssued(inv("SENT", "108.00", "8.00", null));

        verify(ledger).post(eq(BIZ), eq(USER), any(), any(), eq("INVOICE"), eq("42"), linesCaptor.capture());
        List<LedgerService.LineInput> lines = linesCaptor.getValue();
        assertThat(lineFor(lines, "1100").debit()).isEqualByComparingTo("108.00"); // AR
        assertThat(lineFor(lines, "4000").credit()).isEqualByComparingTo("100.00"); // income = total - tax
        assertThat(lineFor(lines, "2200").credit()).isEqualByComparingTo("8.00");   // sales tax
    }

    @Test
    void issuance_noTaxLineWhenNoTax() {
        when(entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(BIZ, "INVOICE", "42")).thenReturn(false);

        posting.postInvoiceIssued(inv("OPEN", "100.00", null, null));

        verify(ledger).post(eq(BIZ), eq(USER), any(), any(), eq("INVOICE"), eq("42"), linesCaptor.capture());
        assertThat(linesCaptor.getValue().stream().anyMatch(l -> "2200".equals(l.accountCode()))).isFalse();
    }

    @Test
    void issuance_skippedForDraftAndWhenAlreadyPosted() {
        posting.postInvoiceIssued(inv("DRAFT", "100.00", null, null));
        verify(ledger, never()).post(anyLong(), anyLong(), any(), any(), any(), any(), any());

        when(entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(BIZ, "INVOICE", "42")).thenReturn(true);
        posting.postInvoiceIssued(inv("SENT", "100.00", null, null));
        verify(ledger, never()).post(anyLong(), anyLong(), any(), any(), any(), any(), any());
    }

    @Test
    void payment_debitsCashCreditsAR() {
        // issuance already posted; payment not yet.
        when(entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(BIZ, "INVOICE", "42")).thenReturn(true);
        when(entryRepo.existsByBusinessIdAndSourceTypeAndSourceRef(BIZ, "PAYMENT", "42")).thenReturn(false);

        posting.postInvoicePaid(inv("PAID", "108.00", "8.00", "108.00"));

        verify(ledger).post(eq(BIZ), eq(USER), any(), any(), eq("PAYMENT"), eq("42"), linesCaptor.capture());
        List<LedgerService.LineInput> lines = linesCaptor.getValue();
        assertThat(lineFor(lines, "1000").debit()).isEqualByComparingTo("108.00");  // cash
        assertThat(lineFor(lines, "1100").credit()).isEqualByComparingTo("108.00"); // clear AR
    }

    @Test
    void void_reversesIssuanceEntry() {
        JournalEntry issuance = new JournalEntry();
        issuance.setId(500L);
        when(entryRepo.findFirstByBusinessIdAndSourceTypeAndSourceRefOrderByIdAsc(BIZ, "INVOICE", "42"))
                .thenReturn(Optional.of(issuance));
        when(entryRepo.existsByBusinessIdAndReversalOf(BIZ, 500L)).thenReturn(false);

        posting.postInvoiceVoided(inv("VOID", "108.00", "8.00", null));

        verify(ledger).reverse(eq(BIZ), eq(USER), eq(500L), any(), any());
    }
}
