package com.mywealthmanagement.businessfinancialsservice.business.dunning;

import com.mywealthmanagement.businessfinancialsservice.business.manual.*;
import com.mywealthmanagement.businessfinancialsservice.comms.CommsClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Automated dunning (order-to-cash Phase 1.9): sends per-offset reminders, once each. */
@ExtendWith(MockitoExtension.class)
class DunningReminderServiceTest {

    private static final long USER = 1L;
    private static final long BIZ = 7L;

    @Mock private BusinessReminderSettingsRepository settingsRepo;
    @Mock private BusinessInvoiceRepository invoiceRepo;
    @Mock private BusinessInvoiceReminderRepository reminderRepo;
    @Mock private ManualBusinessRepository businessRepo;
    @Mock private CommsClient commsClient;

    @InjectMocks private DunningReminderService service;

    private BusinessReminderSettings settings(String offsets, String channel) {
        BusinessReminderSettings s = new BusinessReminderSettings();
        s.setUserId(USER); s.setBusinessId(BIZ); s.setEnabled(true);
        s.setChannel(channel); s.setOffsets(offsets);
        return s;
    }

    private BusinessInvoice invoice(String status, String amount, String paid, LocalDate due) {
        BusinessInvoice inv = new BusinessInvoice();
        inv.setId(500L); inv.setUserId(USER); inv.setBusinessId(BIZ);
        inv.setCustomer("Acme"); inv.setCustomerEmail("ap@acme.com");
        inv.setStatus(status); inv.setAmount(new BigDecimal(amount));
        if (paid != null) inv.setPaidAmount(new BigDecimal(paid));
        inv.setDueDate(due);
        return inv;
    }

    @Test
    void sendsReminderForDueTodayInvoiceAndRecordsIt() {
        LocalDate today = LocalDate.of(2026, 7, 26);
        BusinessInvoice inv = invoice("SENT", "500", null, today); // offset 0 -> due today
        lenient().when(businessRepo.findById(BIZ)).thenReturn(Optional.of(new ManualBusiness()));
        when(invoiceRepo.findByBusinessIdAndUserIdAndDueDate(BIZ, USER, today)).thenReturn(List.of(inv));
        when(reminderRepo.existsByInvoiceIdAndOffsetDays(500L, 0)).thenReturn(false);
        when(commsClient.send(anyString(), anyString(), anyString(), anyString())).thenReturn("SENT");
        when(invoiceRepo.save(any(BusinessInvoice.class))).thenAnswer(i -> i.getArgument(0));

        int sent = service.runForBusiness(settings("0", "AUTO"), today);

        assertThat(sent).isEqualTo(1);
        verify(commsClient).send(eq("EMAIL"), eq("ap@acme.com"), anyString(), anyString());
        verify(reminderRepo).save(any(BusinessInvoiceReminder.class));
        assertThat(inv.getShareToken()).isNotNull(); // minted for the pay link
    }

    @Test
    void skipsWhenAlreadyRemindedForThatOffset() {
        LocalDate today = LocalDate.of(2026, 7, 26);
        BusinessInvoice inv = invoice("OVERDUE", "500", null, today.minusDays(7)); // offset 7
        when(invoiceRepo.findByBusinessIdAndUserIdAndDueDate(BIZ, USER, today.minusDays(7))).thenReturn(List.of(inv));
        when(reminderRepo.existsByInvoiceIdAndOffsetDays(500L, 7)).thenReturn(true);
        lenient().when(businessRepo.findById(BIZ)).thenReturn(Optional.of(new ManualBusiness()));

        int sent = service.runForBusiness(settings("7", "AUTO"), today);

        assertThat(sent).isZero();
        verify(commsClient, never()).send(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void skipsPaidAndVoidAndFullyPaidInvoices() {
        LocalDate today = LocalDate.of(2026, 7, 26);
        lenient().when(businessRepo.findById(BIZ)).thenReturn(Optional.of(new ManualBusiness()));
        when(invoiceRepo.findByBusinessIdAndUserIdAndDueDate(BIZ, USER, today)).thenReturn(List.of(
                invoice("PAID", "500", "500", today),
                invoice("VOID", "500", null, today),
                invoice("PARTIALLY_PAID", "500", "500", today))); // nothing owed

        int sent = service.runForBusiness(settings("0", "AUTO"), today);

        assertThat(sent).isZero();
        verify(commsClient, never()).send(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void parseOffsets_dedupesAndIgnoresJunk() {
        assertThat(DunningReminderService.parseOffsets("-3, 0, 7, 7, x")).containsExactly(-3, 0, 7);
        assertThat(DunningReminderService.parseOffsets(null)).isEmpty();
    }
}
