package com.mywealthmanagement.businessfinancialsservice.business.dunning;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * Daily dunning run. Tune or disable via:
 *   business.dunning.enabled (default true)
 *   business.dunning.cron    (default 08:00 daily)
 * Single-instance VM, so a plain @Scheduled is safe.
 */
@Component
@RequiredArgsConstructor
public class DunningReminderJob {

    private final DunningReminderService service;

    @Value("${business.dunning.enabled:true}")
    private boolean enabled;

    @Scheduled(cron = "${business.dunning.cron:0 0 8 * * *}")
    public void run() {
        if (!enabled) return;
        service.run(LocalDate.now());
    }
}
