package com.mywealthmanagement.accountaggregationservice.transaction;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RecurringBillDetectorTest {

    private Transaction tx(String name, String amount, LocalDate date) {
        Transaction t = new Transaction();
        t.setUserId(1L);
        t.setName(name);
        t.setAmount(new BigDecimal(amount));
        t.setDate(date);
        return t;
    }

    @Test
    void detectsAMonthlySubscription() {
        List<Transaction> txns = new ArrayList<>();
        LocalDate d = LocalDate.of(2026, 1, 5);
        for (int i = 0; i < 5; i++) txns.add(tx("Netflix", "15.99", d.plusMonths(i)));

        List<RecurringBillDto> bills = RecurringBillDetector.detect(txns);

        assertThat(bills).hasSize(1);
        RecurringBillDto b = bills.get(0);
        assertThat(b.getName()).isEqualTo("Netflix");
        assertThat(b.getCadence()).isEqualTo("MONTHLY");
        assertThat(b.getOccurrences()).isEqualTo(5);
        assertThat(b.getAmount()).isEqualByComparingTo("15.99");
        assertThat(b.getNextDate()).isAfter(b.getLastDate());
    }

    @Test
    void ignoresOneOffAndIrregularSpend() {
        List<Transaction> txns = List.of(
                tx("Random Store", "42.00", LocalDate.of(2026, 1, 3)),
                tx("Coffee", "4.50", LocalDate.of(2026, 1, 10)),
                tx("Coffee", "4.50", LocalDate.of(2026, 2, 27)),   // irregular gap
                tx("Coffee", "4.50", LocalDate.of(2026, 5, 1)));
        assertThat(RecurringBillDetector.detect(txns)).isEmpty();
    }

    @Test
    void rejectsRecurringNameWithWildlyVaryingAmounts() {
        List<Transaction> txns = new ArrayList<>();
        LocalDate d = LocalDate.of(2026, 1, 1);
        String[] amts = {"10.00", "200.00", "5.00"};
        for (int i = 0; i < 3; i++) txns.add(tx("Variable Co", amts[i], d.plusMonths(i)));
        assertThat(RecurringBillDetector.detect(txns)).isEmpty();
    }

    @Test
    void emptyInputYieldsNoBills() {
        assertThat(RecurringBillDetector.detect(List.of())).isEmpty();
    }
}
