package com.mywealthmanagement.paymentservice.payment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

/**
 * Daily tiered payment reminders for SCHEDULED bill-pays: a heads-up 5 days out, a
 * reminder 2 days out, and a CRITICAL "due today" nudge on the day itself — so the user
 * can ensure funds are available. Runs once a day (configurable via payments.reminders.cron);
 * disable with payments.reminders.enabled=false.
 */
@Component
public class PaymentReminderJob {

    private static final Logger log = LoggerFactory.getLogger(PaymentReminderJob.class);

    /** Reminder cadence, in days before the scheduled date. */
    private static final int[] REMINDER_OFFSETS = {5, 2, 0};

    private final BillPayIntentRepository repository;
    private final ReminderNotifier notifier;

    public PaymentReminderJob(BillPayIntentRepository repository, ReminderNotifier notifier) {
        this.repository = repository;
        this.notifier = notifier;
    }

    @Scheduled(cron = "${payments.reminders.cron:0 0 13 * * *}")
    public void sendReminders() {
        LocalDate today = LocalDate.now();
        for (int daysUntil : REMINDER_OFFSETS) {
            LocalDate target = today.plusDays(daysUntil);
            List<BillPayIntent> due = repository.findByStatusAndScheduledDate("SCHEDULED", target);
            if (due.isEmpty()) continue;
            log.info("payment-reminders: {} scheduled payment(s) due {} ({} day(s) out)",
                    due.size(), target, daysUntil);
            for (BillPayIntent intent : due) {
                notifier.remind(intent.getUserId(), intent.getPayee(), intent.getAmount(),
                        intent.getScheduledDate(), daysUntil);
            }
        }
    }
}
