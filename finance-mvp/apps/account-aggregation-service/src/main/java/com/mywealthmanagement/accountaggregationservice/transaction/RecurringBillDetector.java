package com.mywealthmanagement.accountaggregationservice.transaction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Detects recurring bills/subscriptions from a user's transactions. Pure + static so it
 * is trivially unit-testable. Heuristic: group by normalized merchant name, and for any
 * group seen >= 3 times at a roughly regular cadence (weekly/biweekly/monthly/yearly)
 * with consistent amounts, emit a recurring bill with the predicted next date.
 */
public final class RecurringBillDetector {

    private RecurringBillDetector() {}

    private static final int MIN_OCCURRENCES = 3;

    /** Cadence buckets: label -> [minDays, maxDays] for the typical gap between charges. */
    private record Cadence(String label, int min, int max, int nominal) {}
    private static final List<Cadence> CADENCES = List.of(
            new Cadence("WEEKLY", 6, 9, 7),
            new Cadence("BIWEEKLY", 12, 16, 14),
            new Cadence("MONTHLY", 25, 35, 30),
            new Cadence("YEARLY", 350, 380, 365));

    public static List<RecurringBillDto> detect(List<Transaction> txns) {
        if (txns == null || txns.isEmpty()) return List.of();

        // Group by normalized name (only spend — positive amounts in this app are charges).
        Map<String, List<Transaction>> byName = txns.stream()
                .filter(t -> t.getName() != null && t.getDate() != null && t.getAmount() != null)
                .filter(t -> t.getAmount().signum() > 0)
                .collect(Collectors.groupingBy(t -> normalize(t.getName())));

        List<RecurringBillDto> out = new ArrayList<>();
        for (List<Transaction> group : byName.values()) {
            if (group.size() < MIN_OCCURRENCES) continue;
            List<Transaction> sorted = group.stream()
                    .sorted(Comparator.comparing(Transaction::getDate))
                    .toList();

            // Median gap (days) between consecutive charges.
            List<Long> gaps = new ArrayList<>();
            for (int i = 1; i < sorted.size(); i++) {
                gaps.add(ChronoUnit.DAYS.between(sorted.get(i - 1).getDate(), sorted.get(i).getDate()));
            }
            long medianGap = median(gaps);

            Cadence cadence = CADENCES.stream()
                    .filter(c -> medianGap >= c.min() && medianGap <= c.max())
                    .findFirst().orElse(null);
            if (cadence == null) continue;

            // Amounts should be reasonably consistent (median +/- 25%).
            List<BigDecimal> amounts = sorted.stream().map(Transaction::getAmount).sorted().toList();
            BigDecimal medAmount = amounts.get(amounts.size() / 2);
            if (medAmount.signum() == 0) continue;
            boolean consistent = amounts.stream().allMatch(a ->
                    a.subtract(medAmount).abs()
                     .compareTo(medAmount.multiply(new BigDecimal("0.25"))) <= 0);
            if (!consistent) continue;

            LocalDate last = sorted.get(sorted.size() - 1).getDate();
            LocalDate next = last.plusDays(medianGap > 0 ? medianGap : cadence.nominal());

            RecurringBillDto dto = new RecurringBillDto();
            dto.setName(displayName(sorted.get(sorted.size() - 1).getName()));
            dto.setAmount(medAmount);
            dto.setCadence(cadence.label());
            dto.setLastDate(last);
            dto.setNextDate(next);
            dto.setOccurrences(sorted.size());
            out.add(dto);
        }
        // Soonest upcoming first.
        out.sort(Comparator.comparing(RecurringBillDto::getNextDate));
        return out;
    }

    private static String normalize(String name) {
        return name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "").trim();
    }

    private static String displayName(String name) {
        return name == null ? "" : name.trim();
    }

    private static long median(List<Long> values) {
        if (values.isEmpty()) return 0;
        List<Long> s = values.stream().sorted().toList();
        return s.get(s.size() / 2);
    }
}
