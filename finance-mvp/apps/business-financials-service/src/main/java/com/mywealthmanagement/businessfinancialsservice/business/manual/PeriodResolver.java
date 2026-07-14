package com.mywealthmanagement.businessfinancialsservice.business.manual;

import java.time.LocalDate;

/**
 * Turns a period key (and optional custom from/to) into a concrete [from, to]
 * date range, resolved on the server so web / iOS / Android all agree on what
 * "This year" or "Trailing 12 months" means. Ranges are inclusive.
 *
 * <p>Supported keys: {@code THIS_MONTH}, {@code THIS_YEAR}, {@code T12M}
 * (trailing 12 months), {@code CUSTOM}. Unknown keys fall back to THIS_MONTH.
 */
public final class PeriodResolver {

    private PeriodResolver() {}

    public record Period(String key, LocalDate from, LocalDate to) {}

    public static Period resolve(String period, String fromStr, String toStr, LocalDate today) {
        String key = period == null ? "THIS_MONTH" : period.trim().toUpperCase();
        switch (key) {
            case "THIS_YEAR" -> {
                return new Period(key, today.withDayOfYear(1), today);
            }
            case "T12M" -> {
                // Trailing 12 months: the last 12 full-plus-current months up to today.
                return new Period(key, today.minusMonths(12).plusDays(1), today);
            }
            case "CUSTOM" -> {
                LocalDate from = parse(fromStr, today.withDayOfMonth(1));
                LocalDate to = parse(toStr, today);
                if (to.isBefore(from)) {  // tolerate reversed input
                    LocalDate t = from; from = to; to = t;
                }
                return new Period("CUSTOM", from, to);
            }
            default -> {
                return new Period("THIS_MONTH", today.withDayOfMonth(1), today);
            }
        }
    }

    private static LocalDate parse(String s, LocalDate fallback) {
        if (s == null || s.isBlank()) return fallback;
        try {
            String v = s.trim();
            if (v.length() > 10) v = v.substring(0, 10);
            return LocalDate.parse(v);
        } catch (Exception e) {
            return fallback;
        }
    }
}
