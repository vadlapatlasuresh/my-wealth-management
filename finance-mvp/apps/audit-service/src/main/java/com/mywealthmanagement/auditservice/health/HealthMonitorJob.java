package com.mywealthmanagement.auditservice.health;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Periodically polls each backend service's health endpoint and records UP↔DOWN
 * TRANSITIONS to {@link SystemHealthEvent} (the alert/audit log), emailing the configured
 * admin on each change via {@link HealthAlertNotifier}. Only transitions are recorded/
 * alerted (in-memory last-state map), so a sustained outage produces one DOWN row + one
 * recovery row — not a flood.
 *
 * Config:
 *   monitor.enabled       master switch (default true)
 *   monitor.cron          schedule (default every 2 min)
 *   monitor.services      comma list of name=healthUrl (default: the compose services)
 *   monitor.alert.admin-user-id  who gets the alert email (unset = table-only)
 */
@Component
public class HealthMonitorJob {

    private static final Logger log = LoggerFactory.getLogger(HealthMonitorJob.class);

    private static final String DEFAULT_SERVICES = String.join(",",
            "api-gateway=http://api-gateway:8080/actuator/health",
            "auth-service=http://auth-service:8080/actuator/health",
            "account-aggregation-service=http://account-aggregation-service:8080/actuator/health",
            "financial-core-service=http://financial-core-service:8080/actuator/health",
            "real-estate-service=http://real-estate-service:8080/actuator/health",
            "business-financials-service=http://business-financials-service:8080/actuator/health",
            "ai-insights-service=http://ai-insights-service:8080/actuator/health",
            "payment-service=http://payment-service:8080/actuator/health",
            "notification-service=http://notification-service:8080/actuator/health",
            "platform-config-service=http://platform-config-service:8080/actuator/health",
            "secrets-service=http://secrets-service:8080/actuator/health");

    private final SystemHealthEventRepository repository;
    private final HealthAlertNotifier notifier;
    private final boolean enabled;
    private final Map<String, String> targets = new LinkedHashMap<>();
    private final Map<String, String> lastStatus = new ConcurrentHashMap<>();
    private final RestClient http = RestClient.builder()
            .requestFactory(timeoutFactory()).build();

    public HealthMonitorJob(SystemHealthEventRepository repository,
                            HealthAlertNotifier notifier,
                            @Value("${monitor.enabled:true}") boolean enabled,
                            @Value("${monitor.services:}") String services) {
        this.repository = repository;
        this.notifier = notifier;
        this.enabled = enabled;
        String cfg = (services == null || services.isBlank()) ? DEFAULT_SERVICES : services;
        for (String pair : cfg.split(",")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2 && !kv[0].isBlank() && !kv[1].isBlank()) {
                targets.put(kv[0].trim(), kv[1].trim());
            }
        }
    }

    @Scheduled(cron = "${monitor.cron:0 */2 * * * *}")
    public void poll() {
        if (!enabled) return;
        targets.forEach((name, url) -> {
            String status;
            String detail = null;
            try {
                String body = http.get().uri(url).retrieve().body(String.class);
                boolean up = body != null && body.contains("\"status\":\"UP\"");
                status = up ? "UP" : "DOWN";
                if (!up) detail = "health not UP";
            } catch (Exception e) {
                status = "DOWN";
                detail = e.getClass().getSimpleName() + ": " + e.getMessage();
            }
            String prev = lastStatus.put(name, status);
            // Record + alert only on a real change (and the first observed DOWN).
            if (prev == null) {
                if ("DOWN".equals(status)) record(name, status, detail);
            } else if (!prev.equals(status)) {
                record(name, status, detail);
            }
        });
    }

    private void record(String name, String status, String detail) {
        try {
            SystemHealthEvent e = new SystemHealthEvent();
            e.setServiceName(name);
            e.setStatus(status);
            e.setDetail(detail);
            repository.save(e);
            log.warn("health-monitor: {} -> {} ({})", name, status, detail);
            notifier.alert(name, status, detail);
        } catch (Exception ex) {
            log.warn("health-monitor: failed to record {} {}: {}", name, status, ex.getMessage());
        }
    }

    private static org.springframework.http.client.ClientHttpRequestFactory timeoutFactory() {
        var f = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        f.setConnectTimeout((int) Duration.ofSeconds(3).toMillis());
        f.setReadTimeout((int) Duration.ofSeconds(4).toMillis());
        return f;
    }
}
