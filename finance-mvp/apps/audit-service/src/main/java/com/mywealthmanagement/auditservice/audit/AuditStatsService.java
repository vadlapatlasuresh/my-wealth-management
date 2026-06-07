package com.mywealthmanagement.auditservice.audit;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Aggregates the audit event stream into operator KPIs for the admin dashboard.
 * All figures are derived from real audit data (gateway request capture + domain
 * events) — no synthetic numbers.
 */
@Service
@RequiredArgsConstructor
public class AuditStatsService {

    private final AuditEventRepository repository;

    public Map<String, Object> stats(int days) {
        int window = Math.max(1, Math.min(days, 365));
        LocalDateTime from = LocalDateTime.now().minusDays(window);
        List<AuditEvent> events = repository.findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(from);

        long total = events.size();
        long success = events.stream().filter(e -> "SUCCESS".equalsIgnoreCase(e.getOutcome())).count();
        long failure = events.stream().filter(e -> e.getOutcome() != null && !"SUCCESS".equalsIgnoreCase(e.getOutcome())).count();

        // Error rate over events that carry an HTTP status.
        List<AuditEvent> withStatus = events.stream().filter(e -> e.getStatus() != null).toList();
        long errors = withStatus.stream().filter(e -> e.getStatus() >= 400).count();
        double errorRate = withStatus.isEmpty() ? 0 : (double) errors / withStatus.size();

        long activeUsers = events.stream().map(AuditEvent::getUserId)
                .filter(Objects::nonNull).distinct().count();

        long loginSuccess = events.stream().filter(e -> "auth.login.success".equals(e.getAction())).count();
        long loginFailure = events.stream().filter(e -> "auth.login.failure".equals(e.getAction())).count();
        long signups = events.stream().filter(e -> e.getAction() != null && e.getAction().startsWith("auth.register")).count();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("windowDays", window);
        out.put("totalEvents", total);
        out.put("successEvents", success);
        out.put("failureEvents", failure);
        out.put("errorRate", round4(errorRate));
        out.put("activeUsers", activeUsers);
        out.put("logins", Map.of("success", loginSuccess, "failure", loginFailure));
        out.put("signups", signups);
        out.put("topActions", topCounts(events, AuditEvent::getAction, 8));
        out.put("byService", topCounts(events, e -> e.getService() == null ? "unknown" : e.getService(), 10));
        out.put("dailyVolume", dailyVolume(events, window));
        out.put("recentFailures", events.stream()
                .filter(e -> e.getOutcome() != null && !"SUCCESS".equalsIgnoreCase(e.getOutcome()))
                .limit(10)
                .map(this::brief).toList());
        return out;
    }

    private List<Map<String, Object>> topCounts(List<AuditEvent> events,
                                                java.util.function.Function<AuditEvent, String> key, int limit) {
        Map<String, Long> counts = events.stream()
                .map(key).filter(Objects::nonNull)
                .collect(Collectors.groupingBy(k -> k, Collectors.counting()));
        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(limit)
                .map(e -> { Map<String, Object> m = new LinkedHashMap<>(); m.put("key", e.getKey()); m.put("count", e.getValue()); return m; })
                .toList();
    }

    private List<Map<String, Object>> dailyVolume(List<AuditEvent> events, int window) {
        Map<LocalDate, Long> byDay = events.stream()
                .filter(e -> e.getCreatedAt() != null)
                .collect(Collectors.groupingBy(e -> e.getCreatedAt().toLocalDate(), Collectors.counting()));
        List<Map<String, Object>> series = new ArrayList<>();
        LocalDate today = LocalDate.now();
        for (int i = window - 1; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("date", d.toString());
            m.put("count", byDay.getOrDefault(d, 0L));
            series.add(m);
        }
        return series;
    }

    private Map<String, Object> brief(AuditEvent e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("action", e.getAction());
        m.put("outcome", e.getOutcome());
        m.put("status", e.getStatus());
        m.put("userId", e.getUserId());
        m.put("at", e.getCreatedAt() == null ? null : e.getCreatedAt().toString());
        return m;
    }

    private static double round4(double x) {
        return Math.round(x * 10000.0) / 10000.0;
    }
}
