package com.mywealthmanagement.businessfinancialsservice.business.recurring;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * Daily generator for due recurring-invoice schedules. Tune or disable via:
 *   business.recurring.enabled (default true)
 *   business.recurring.cron    (default 06:15 daily)
 *
 * Single-instance deployment (one VM), so a plain @Scheduled is safe — no distributed lock.
 */
@Component
@RequiredArgsConstructor
public class RecurringInvoiceJob {

    private final RecurringInvoiceService service;

    @Value("${business.recurring.enabled:true}")
    private boolean enabled;

    @Scheduled(cron = "${business.recurring.cron:0 15 6 * * *}")
    public void run() {
        if (!enabled) return;
        service.generateDue(LocalDate.now());
    }
}
