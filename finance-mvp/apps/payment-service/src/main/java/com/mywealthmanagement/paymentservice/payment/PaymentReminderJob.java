package com.mywealthmanagement.paymentservice.payment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

/**
 * Daily payment reminders: notifies a user the day before a SCHEDULED bill-pay lands,
 * so they can ensure funds are available. Runs once a day (configurable via
 * payments.reminders.cron); disable with payments.reminders.enabled=false.
 */
@Component
public class PaymentReminderJob {

    private static final Logger log = LoggerFactory.getLogger(PaymentReminderJob.class);

    private final BillPayIntentRepository repository;
    private final ReminderNotifier notifier;

    public PaymentReminderJob(BillPayIntentRepository repository, ReminderNotifier notifier) {
        this.repository = repository;
        this.notifier = notifier;
    }

    @Scheduled(cron = "${payments.reminders.cron:0 0 13 * * *}")
    public void sendReminders() {
        LocalDate tomorrow = LocalDate.now().plusDays(1);
        List<BillPayIntent> due = repository.findByStatusAndScheduledDate("SCHEDULED", tomorrow);
        if (due.isEmpty()) return;
        log.info("payment-reminders: {} scheduled payment(s) due {}", due.size(), tomorrow);
        for (BillPayIntent intent : due) {
            notifier.remind(intent.getUserId(), intent.getPayee(), intent.getAmount(), intent.getScheduledDate());
        }
    }
}
