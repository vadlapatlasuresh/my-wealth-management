package com.mywealthmanagement.businessfinancialsservice.business.dunning;

import com.mywealthmanagement.businessfinancialsservice.business.manual.*;
import com.mywealthmanagement.businessfinancialsservice.comms.CommsClient;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Automated dunning (order-to-cash, Phase 1.9): for each business that opted in, emails/texts
 * the customer at the configured day offsets around an invoice's due date. Idempotent — a
 * {@link BusinessInvoiceReminder} row per (invoice, offset) means each reminder fires once.
 */
@Service
@RequiredArgsConstructor
public class DunningReminderService {

    private static final Logger log = LoggerFactory.getLogger(DunningReminderService.class);
    private static final Set<String> NON_AR = Set.of("DRAFT", "PAID", "VOID");

    private final BusinessReminderSettingsRepository settingsRepo;
    private final BusinessInvoiceRepository invoiceRepo;
    private final BusinessInvoiceReminderRepository reminderRepo;
    private final ManualBusinessRepository businessRepo;
    private final CommsClient commsClient;

    @Value("${app.web-url:http://localhost:5173}")
    private String webUrl;

    /** Sends every reminder due today across all opted-in businesses. Returns the count sent. */
    @Transactional
    public int run(LocalDate today) {
        int sent = 0;
        for (BusinessReminderSettings s : settingsRepo.findByEnabledTrue()) {
            try {
                sent += runForBusiness(s, today);
            } catch (RuntimeException e) {
                log.warn("dunning: business {} failed: {}", s.getBusinessId(), e.getMessage());
            }
        }
        if (sent > 0) log.info("dunning: sent {} reminder(s)", sent);
        return sent;
    }

    /** Runs the reminders for one business now (used by the manual "run now" action). */
    @Transactional
    public int runForBusiness(BusinessReminderSettings s, LocalDate today) {
        List<Integer> offsets = parseOffsets(s.getOffsets());
        if (offsets.isEmpty()) return 0;
        ManualBusiness biz = businessRepo.findById(s.getBusinessId()).orElse(null);
        String bizName = biz != null ? biz.getName() : "our business";
        int sent = 0;
        for (int offset : offsets) {
            // An invoice due on (today - offset) reaches this offset's reminder today.
            LocalDate due = today.minusDays(offset);
            for (BusinessInvoice inv : invoiceRepo.findByBusinessIdAndUserIdAndDueDate(s.getBusinessId(), s.getUserId(), due)) {
                if (shouldRemind(inv) && !reminderRepo.existsByInvoiceIdAndOffsetDays(inv.getId(), offset)) {
                    if (sendReminder(inv, s, offset, bizName)) sent++;
                }
            }
        }
        return sent;
    }

    private boolean shouldRemind(BusinessInvoice inv) {
        String st = inv.getStatus() == null ? "" : inv.getStatus().toUpperCase();
        if (NON_AR.contains(st)) return false;
        BigDecimal amt = inv.getAmount() == null ? BigDecimal.ZERO : inv.getAmount();
        BigDecimal paid = inv.getPaidAmount() == null ? BigDecimal.ZERO : inv.getPaidAmount();
        return amt.subtract(paid).signum() > 0; // still something owed
    }

    private boolean sendReminder(BusinessInvoice inv, BusinessReminderSettings s, int offset, String bizName) {
        String channel = resolveChannel(s.getChannel(), inv);
        if (channel == null) return false; // no usable contact for the chosen channel
        String recipient = "SMS".equals(channel) ? inv.getCustomerPhone() : inv.getCustomerEmail();

        if (inv.getShareToken() == null) {
            inv.setShareToken(java.util.UUID.randomUUID().toString().replace("-", ""));
            invoiceRepo.save(inv);
        }
        String base = webUrl == null || webUrl.isBlank() ? "" : webUrl.replaceAll("/+$", "");
        String publicUrl = base + "/invoice/" + inv.getShareToken();
        BigDecimal outstanding = inv.getAmount().subtract(inv.getPaidAmount() == null ? BigDecimal.ZERO : inv.getPaidAmount());
        String when = offset < 0 ? "is due on " + inv.getDueDate()
                : offset == 0 ? "is due today"
                : "is now " + offset + " day" + (offset == 1 ? "" : "s") + " overdue";
        String subject = "Payment reminder from " + bizName;
        String message = "Hi " + inv.getCustomer() + ", a friendly reminder that your invoice from "
                + bizName + " for " + usd(outstanding) + " " + when + ".\nView and pay: " + publicUrl;

        String status = commsClient.send(channel, recipient, subject, message);

        BusinessInvoiceReminder r = new BusinessInvoiceReminder();
        r.setInvoiceId(inv.getId());
        r.setUserId(s.getUserId());
        r.setOffsetDays(offset);
        r.setChannel(channel);
        r.setDeliveryStatus(status);
        reminderRepo.save(r);
        return true;
    }

    /** AUTO picks email then SMS; EMAIL/SMS require that contact. Returns null when unusable. */
    private String resolveChannel(String pref, BusinessInvoice inv) {
        boolean hasEmail = inv.getCustomerEmail() != null && !inv.getCustomerEmail().isBlank();
        boolean hasPhone = inv.getCustomerPhone() != null && !inv.getCustomerPhone().isBlank();
        String p = pref == null ? "AUTO" : pref.toUpperCase();
        return switch (p) {
            case "EMAIL" -> hasEmail ? "EMAIL" : null;
            case "SMS" -> hasPhone ? "SMS" : null;
            default -> hasEmail ? "EMAIL" : (hasPhone ? "SMS" : null);
        };
    }

    /** Parses "-3,0,7" into a de-duplicated list of offsets, ignoring junk. */
    public static List<Integer> parseOffsets(String csv) {
        List<Integer> out = new ArrayList<>();
        if (csv == null) return out;
        for (String part : csv.split(",")) {
            String t = part.trim();
            if (t.isEmpty()) continue;
            try {
                int v = Integer.parseInt(t);
                if (!out.contains(v)) out.add(v);
            } catch (NumberFormatException ignored) { /* skip */ }
        }
        return out;
    }

    private static String usd(BigDecimal amount) {
        return amount == null ? "$0.00" : String.format("$%,.2f", amount);
    }
}
