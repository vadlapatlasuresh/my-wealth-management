package com.mywealthmanagement.businessfinancialsservice.business.recurring;

import com.mywealthmanagement.businessfinancialsservice.business.manual.*;
import com.mywealthmanagement.businessfinancialsservice.comms.NotificationClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Recurring-invoice generation (order-to-cash Phase 1.4a): a due schedule materializes a
 * real invoice with the template's totals + copied line items, then advances (or ends).
 */
@ExtendWith(MockitoExtension.class)
class RecurringInvoiceServiceTest {

    @Mock private BusinessRecurringInvoiceRepository scheduleRepo;
    @Mock private BusinessRecurringInvoiceItemRepository scheduleItemRepo;
    @Mock private BusinessInvoiceRepository invoiceRepo;
    @Mock private BusinessInvoiceLineItemRepository invoiceItemRepo;
    @Mock private NotificationClient notificationClient;
    @Mock private com.mywealthmanagement.businessfinancialsservice.ledger.LedgerPostingService ledgerPosting;

    @InjectMocks private RecurringInvoiceService service;

    private BusinessRecurringInvoice schedule(String freq, LocalDate next, LocalDate end) {
        BusinessRecurringInvoice s = new BusinessRecurringInvoice();
        s.setId(10L);
        s.setUserId(1L);
        s.setBusinessId(7L);
        s.setCustomer("Acme");
        s.setFrequency(freq);
        s.setIntervalCount(1);
        s.setStartDate(next);
        s.setNextRunDate(next);
        s.setEndDate(end);
        s.setTaxRate(new BigDecimal("10"));
        s.setDueDays(14);
        s.setStatus("ACTIVE");
        return s;
    }

    private BusinessRecurringInvoiceItem item(int pos, String desc, String qty, String price, String amt) {
        BusinessRecurringInvoiceItem li = new BusinessRecurringInvoiceItem();
        li.setPosition(pos); li.setDescription(desc);
        li.setQuantity(new BigDecimal(qty)); li.setUnitPrice(new BigDecimal(price)); li.setAmount(new BigDecimal(amt));
        return li;
    }

    @Test
    void generateOne_buildsInvoiceWithTotalsAndCopiesItems_thenAdvances() {
        BusinessRecurringInvoice s = schedule("MONTHLY", LocalDate.of(2026, 8, 1), null);
        when(scheduleItemRepo.findByScheduleIdOrderByPositionAsc(10L))
                .thenReturn(List.of(item(0, "Retainer", "1", "1000", "1000.00")));
        when(invoiceRepo.save(any(BusinessInvoice.class))).thenAnswer(i -> { BusinessInvoice v = i.getArgument(0); v.setId(500L); return v; });
        lenient().when(invoiceItemRepo.saveAll(any())).thenAnswer(i -> i.getArgument(0));

        BusinessInvoice inv = service.generateOne(s, LocalDate.of(2026, 8, 1));

        assertThat(inv.getCustomer()).isEqualTo("Acme");
        assertThat(inv.getStatus()).isEqualTo("OPEN");
        assertThat(inv.getSubtotal()).isEqualByComparingTo("1000.00");
        assertThat(inv.getTaxAmount()).isEqualByComparingTo("100.00");
        assertThat(inv.getAmount()).isEqualByComparingTo("1100.00");
        assertThat(inv.getDueDate()).isEqualTo(LocalDate.of(2026, 8, 15)); // +14 due days
        // Schedule advanced by one month, count bumped, still active.
        assertThat(s.getNextRunDate()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(s.getGeneratedCount()).isEqualTo(1);
        assertThat(s.getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    void generateOne_endsScheduleWhenNextRunPassesEndDate() {
        BusinessRecurringInvoice s = schedule("MONTHLY", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 20));
        when(scheduleItemRepo.findByScheduleIdOrderByPositionAsc(10L)).thenReturn(List.of());
        when(invoiceRepo.save(any(BusinessInvoice.class))).thenAnswer(i -> { BusinessInvoice v = i.getArgument(0); v.setId(501L); return v; });
        lenient().when(invoiceItemRepo.saveAll(any())).thenAnswer(i -> i.getArgument(0));

        service.generateOne(s, LocalDate.of(2026, 8, 1));

        // Next run (Sep 1) is past the Aug 20 end date -> schedule ENDED.
        assertThat(s.getStatus()).isEqualTo("ENDED");
    }

    @Test
    void advance_respectsFrequency() {
        LocalDate d = LocalDate.of(2026, 1, 31);
        assertThat(RecurringInvoiceService.advance(d, "WEEKLY", 1)).isEqualTo(LocalDate.of(2026, 2, 7));
        assertThat(RecurringInvoiceService.advance(d, "MONTHLY", 1)).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(RecurringInvoiceService.advance(d, "QUARTERLY", 1)).isEqualTo(LocalDate.of(2026, 4, 30));
        assertThat(RecurringInvoiceService.advance(d, "ANNUALLY", 1)).isEqualTo(LocalDate.of(2027, 1, 31));
    }
}
