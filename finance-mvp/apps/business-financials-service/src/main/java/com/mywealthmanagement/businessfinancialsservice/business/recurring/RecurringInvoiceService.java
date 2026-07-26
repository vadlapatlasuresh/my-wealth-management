package com.mywealthmanagement.businessfinancialsservice.business.recurring;

import com.mywealthmanagement.businessfinancialsservice.business.manual.*;
import com.mywealthmanagement.businessfinancialsservice.comms.NotificationClient;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Materializes real invoices from recurring schedules (order-to-cash, Phase 1.4a). Shared by
 * the daily {@link RecurringInvoiceJob} and the manual "run now" endpoint. Each generated
 * invoice is an ordinary {@link BusinessInvoice} (status OPEN) so it flows into AR, the
 * public page, reminders and reconciliation like any other.
 */
@Service
@RequiredArgsConstructor
public class RecurringInvoiceService {

    private static final Logger log = LoggerFactory.getLogger(RecurringInvoiceService.class);

    private final BusinessRecurringInvoiceRepository scheduleRepo;
    private final BusinessRecurringInvoiceItemRepository scheduleItemRepo;
    private final BusinessInvoiceRepository invoiceRepo;
    private final BusinessInvoiceLineItemRepository invoiceItemRepo;
    private final NotificationClient notificationClient;

    /** Generates invoices for every ACTIVE schedule due on or before {@code today}. */
    @Transactional
    public int generateDue(LocalDate today) {
        List<BusinessRecurringInvoice> due = scheduleRepo.findByStatusAndNextRunDateLessThanEqual("ACTIVE", today);
        int made = 0;
        for (BusinessRecurringInvoice s : due) {
            try {
                // A schedule can be behind more than one period (e.g. after downtime); catch up.
                int guard = 0;
                while ("ACTIVE".equals(s.getStatus()) && !s.getNextRunDate().isAfter(today) && guard++ < 60) {
                    generateOne(s, s.getNextRunDate());
                    made++;
                }
            } catch (RuntimeException e) {
                log.warn("recurring: schedule {} failed to generate: {}", s.getId(), e.getMessage());
            }
        }
        if (made > 0) log.info("recurring: generated {} invoice(s) from due schedules", made);
        return made;
    }

    /**
     * Generates one invoice from a schedule dated {@code issueDate}, then advances the
     * schedule to its next run (marking it ENDED once past its end date). Returns the invoice.
     */
    @Transactional
    public BusinessInvoice generateOne(BusinessRecurringInvoice s, LocalDate issueDate) {
        List<BusinessRecurringInvoiceItem> template = scheduleItemRepo.findByScheduleIdOrderByPositionAsc(s.getId());
        BigDecimal subtotal = template.stream()
                .map(BusinessRecurringInvoiceItem::getAmount)
                .filter(a -> a != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        InvoiceMath.Breakdown b = InvoiceMath.compute(subtotal, s.getDiscountType(), s.getDiscountValue(), s.getTaxRate());

        BusinessInvoice inv = new BusinessInvoice();
        inv.setUserId(s.getUserId());
        inv.setBusinessId(s.getBusinessId());
        inv.setCustomerId(s.getCustomerId());
        inv.setCustomer(s.getCustomer());
        inv.setCustomerEmail(s.getCustomerEmail());
        inv.setCustomerPhone(s.getCustomerPhone());
        inv.setStatus("OPEN");
        inv.setIssuedAt(issueDate);
        inv.setDueDate(issueDate.plusDays(Math.max(0, s.getDueDays())));
        inv.setNotes(s.getNotes());
        inv.setSubtotal(b.subtotal());
        inv.setDiscountType(b.discountType());
        inv.setDiscountValue(b.discountValue());
        inv.setDiscountAmount(b.discountAmount());
        inv.setTaxRate(b.taxRate());
        inv.setTaxAmount(b.taxAmount());
        inv.setAmount(b.total());
        BusinessInvoice saved = invoiceRepo.save(inv);

        List<BusinessInvoiceLineItem> lines = new ArrayList<>();
        for (BusinessRecurringInvoiceItem t : template) {
            BusinessInvoiceLineItem li = new BusinessInvoiceLineItem();
            li.setInvoiceId(saved.getId());
            li.setUserId(s.getUserId());
            li.setPosition(t.getPosition());
            li.setDescription(t.getDescription());
            li.setQuantity(t.getQuantity());
            li.setUnitPrice(t.getUnitPrice());
            li.setAmount(t.getAmount());
            lines.add(li);
        }
        invoiceItemRepo.saveAll(lines);

        // Advance the schedule.
        s.setLastGeneratedAt(LocalDateTime.now());
        s.setGeneratedCount(s.getGeneratedCount() + 1);
        LocalDate next = advance(s.getNextRunDate(), s.getFrequency(), s.getIntervalCount());
        s.setNextRunDate(next);
        if (s.getEndDate() != null && next.isAfter(s.getEndDate())) {
            s.setStatus("ENDED");
        }
        scheduleRepo.save(s);

        notificationClient.notify(s.getUserId(), "BUSINESS", "Recurring invoice created",
                "A " + s.getFrequency().toLowerCase() + " invoice for " + saved.getCustomer()
                        + " (" + saved.getAmount() + ") was generated.");
        return saved;
    }

    /** Advances a date by {@code interval} periods of {@code frequency}. */
    public static LocalDate advance(LocalDate from, String frequency, int interval) {
        int n = Math.max(1, interval);
        return switch (frequency == null ? "" : frequency.toUpperCase()) {
            case "WEEKLY" -> from.plusWeeks(n);
            case "QUARTERLY" -> from.plusMonths(3L * n);
            case "ANNUALLY" -> from.plusYears(n);
            default -> from.plusMonths(n); // MONTHLY
        };
    }
}
