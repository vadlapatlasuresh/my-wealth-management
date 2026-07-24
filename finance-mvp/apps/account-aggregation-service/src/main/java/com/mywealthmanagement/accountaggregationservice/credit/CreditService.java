package com.mywealthmanagement.accountaggregationservice.credit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Credit monitoring — STUB provider (Phase 4). Behind the same config-flag + mock-fallback
 * pattern every integration in this codebase uses:
 *
 *   • credit.provider.enabled = false (default) → return a DETERMINISTIC demo profile so the
 *     endpoint is useful without a real bureau. The payload is stable per user (seeded by the
 *     user id) and clearly marked provider="demo", so the web client keeps its "demo" banner
 *     even when the client-side live flag is on.
 *   • credit.provider.enabled = true → where a real bureau integration would slot in. Until one
 *     is wired we still return the demo profile (never a fabricated "live" score).
 *
 * Response shape matches what the web client's normalizeLiveProfile() expects: it can either
 * take our factors directly or derive them from the raw metrics we include (onTimePct, etc.).
 * Pure + deterministic so it unit-tests without Spring (see CreditServiceTest).
 */
@Service
public class CreditService {

    private static final int SCALE_MIN = 300;
    private static final int SCALE_MAX = 850;
    private static final String[] MONTHS = {"Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"};

    @Value("${credit.provider.enabled:false}")
    private boolean providerEnabled; // reserved for a real bureau; demo fallback otherwise

    /** Deterministic demo credit profile for a user. Stable across calls (seeded by userId). */
    public Map<String, Object> profileFor(long userId) {
        Random rnd = new Random(userId * 2654435761L + 12345L);

        int current = 648 + rnd.nextInt(159); // [648, 806]

        // 12-month history drifting up to `current` with small wobble (oldest → newest).
        List<Map<String, Object>> history = new ArrayList<>();
        double s = current - (6 + rnd.nextInt(29));
        LocalDate now = LocalDate.now(ZoneOffset.UTC);
        for (int i = 11; i >= 0; i--) {
            int monthIdx = now.minusMonths(i).getMonthValue() - 1;
            double step = (current - s) / (i + 1) + (rnd.nextDouble() - 0.5) * 8;
            s = clamp((int) Math.round(s + step));
            int score = (i == 0) ? current : (int) s;
            Map<String, Object> pt = new LinkedHashMap<>();
            pt.put("month", MONTHS[monthIdx]);
            pt.put("score", score);
            history.add(pt);
        }
        int prev = history.size() >= 2 ? (int) history.get(history.size() - 2).get("score") : current;
        int delta = current - prev;

        int limit = (8 + rnd.nextInt(35)) * 1000;
        double utilPct = (4 + rnd.nextInt(43)) / 100.0;
        int balance = (int) Math.round(limit * utilPct);
        double onTimePct = (94 + rnd.nextInt(7)) / 100.0;
        int avgAgeMonths = 28 + rnd.nextInt(105);
        int accountTypes = 2 + rnd.nextInt(3);
        int inquiries12mo = rnd.nextInt(5);

        Map<String, Object> utilization = new LinkedHashMap<>();
        utilization.put("pct", round2(utilPct));
        utilization.put("balance", balance);
        utilization.put("limit", limit);

        // A couple of recent changes for the timeline.
        List<Map<String, Object>> changes = new ArrayList<>();
        if (delta != 0) {
            changes.add(change("score", delta > 0 ? "up" : "down",
                    "Score " + (delta > 0 ? "rose " : "dropped ") + Math.abs(delta) + " pts",
                    "Since your last report", now.minusDays(1 + rnd.nextInt(6))));
        }
        changes.add(change("utilization", utilPct < 0.3 ? "up" : "down",
                "Utilization at " + Math.round(utilPct * 100) + "%",
                balance + " of " + limit + " used", now.minusDays(2 + rnd.nextInt(9))));
        if (inquiries12mo > 0) {
            changes.add(change("inquiry", "down", "New hard inquiry reported",
                    "A recent credit application", now.minusDays(8 + rnd.nextInt(33))));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        // provider stays "demo" until a real bureau is wired — honesty over a fake "live".
        out.put("provider", "demo");
        out.put("score", current);
        out.put("delta", delta);
        out.put("asOf", now.toString());
        out.put("scaleMin", SCALE_MIN);
        out.put("scaleMax", SCALE_MAX);
        out.put("history", history);
        out.put("utilization", utilization);
        // Raw metrics — the web client derives the FICO factor breakdown from these.
        out.put("onTimePct", round2(onTimePct));
        out.put("avgAgeMonths", avgAgeMonths);
        out.put("accountTypes", accountTypes);
        out.put("inquiries12mo", inquiries12mo);
        out.put("changes", changes);
        return out;
    }

    public boolean isProviderEnabled() { return providerEnabled; }

    private static Map<String, Object> change(String type, String dir, String title, String detail, LocalDate date) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("type", type);
        c.put("direction", dir);
        c.put("title", title);
        c.put("detail", detail);
        c.put("date", date.toString());
        return c;
    }

    private static int clamp(int v) { return Math.max(SCALE_MIN, Math.min(SCALE_MAX, v)); }
    private static double round2(double v) { return Math.round(v * 100.0) / 100.0; }
}
