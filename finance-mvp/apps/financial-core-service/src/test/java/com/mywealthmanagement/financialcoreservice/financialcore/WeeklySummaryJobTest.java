package com.mywealthmanagement.financialcoreservice.financialcore;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** Unit tests for the weekly digest message body. */
class WeeklySummaryJobTest {

    private static NetWorthSnapshot snap(long id, String total) {
        NetWorthSnapshot s = new NetWorthSnapshot();
        s.setId(id);
        s.setUserId(1L);
        s.setSnapshotDate(LocalDate.of(2026, 6, 1));
        s.setTotal(new BigDecimal(total));
        return s;
    }

    @Test
    void reportsIncreaseWithAmountAndPercent() {
        String body = WeeklySummaryJob.digestBody(snap(2, "110000"), snap(1, "100000"));
        assertThat(body).contains("$110,000");
        assertThat(body).contains("up");
        assertThat(body).contains("$10,000");
        assertThat(body).contains("(10.0%)");
        assertThat(body).contains("this week");
    }

    @Test
    void reportsDecrease() {
        String body = WeeklySummaryJob.digestBody(snap(2, "90000"), snap(1, "100000"));
        assertThat(body).contains("down");
        assertThat(body).contains("$10,000");
    }

    @Test
    void flatWeekHasNoAmount() {
        String body = WeeklySummaryJob.digestBody(snap(2, "100000"), snap(1, "100000"));
        assertThat(body).contains("flat");
        assertThat(body).doesNotContain("%");
    }

    @Test
    void noPriorSnapshotOmitsChange() {
        String body = WeeklySummaryJob.digestBody(snap(2, "100000"), null);
        assertThat(body).contains("$100,000");
        assertThat(body).doesNotContain("this week");
    }

    @Test
    void samePointAsLatestIsTreatedAsNoChange() {
        // When the "week ago" lookup returns the same row as latest, don't report a change.
        NetWorthSnapshot only = snap(5, "100000");
        String body = WeeklySummaryJob.digestBody(only, only);
        assertThat(body).doesNotContain("this week");
    }
}
