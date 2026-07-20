package com.mywealthmanagement.realestateservice.holding;

import com.mywealthmanagement.realestateservice.holding.dto.HoldingSummaryDto;
import com.mywealthmanagement.realestateservice.holding.dto.K1YearSummaryDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Fixed clock: which tax year the job asks about depends on today's date. */
@ExtendWith(MockitoExtension.class)
class HoldingAlertsJobTest {

    @Mock private PrivateHoldingRepository holdingRepository;
    @Mock private PrivateHoldingService holdingService;
    @Mock private K1Service k1Service;
    @Mock private HoldingAlertNotifier notifier;

    /** 1 June 2026 — so the tax year in question is 2025. */
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-06-01T12:00:00Z"), ZoneOffset.UTC);

    private HoldingAlertsJob job(boolean enabled) {
        return new HoldingAlertsJob(holdingRepository, holdingService, k1Service, notifier, CLOCK, enabled);
    }

    private K1YearSummaryDto k1s(int overdue) {
        K1YearSummaryDto d = new K1YearSummaryDto();
        d.setTaxYear(2025);
        d.setOverdue(overdue);
        return d;
    }

    private HoldingSummaryDto summary(String uncalled) {
        HoldingSummaryDto s = new HoldingSummaryDto();
        s.setUncalled(uncalled == null ? null : new BigDecimal(uncalled));
        return s;
    }

    // ---- silence is the default ----

    @Test
    void staysSilentWhenNothingIsOutstanding() {
        when(k1Service.getYearForUser(7L, 2025)).thenReturn(k1s(0));
        when(holdingService.getSummaryForUser(7L)).thenReturn(summary("0"));

        // An alert that fires regardless is one the user learns to ignore.
        assertThat(job(true).alertBodyFor(7L)).isNull();
    }

    @Test
    void staysSilentWhenUncalledCapitalIsRounding() {
        when(k1Service.getYearForUser(7L, 2025)).thenReturn(k1s(0));
        when(holdingService.getSummaryForUser(7L)).thenReturn(summary("250"));

        assertThat(job(true).alertBodyFor(7L)).isNull();
    }

    @Test
    void staysSilentWhenTheUserHasNoHoldingsAtAll() {
        when(holdingRepository.findDistinctUserIds()).thenReturn(List.of());

        job(true).sendWeeklyAlerts();

        verify(notifier, never()).send(anyLong(), any(), any());
    }

    // ---- what it does say ----

    @Test
    void flagsOverdueK1sWithTheYearAndTheConsequence() {
        when(k1Service.getYearForUser(7L, 2025)).thenReturn(k1s(2));
        when(holdingService.getSummaryForUser(7L)).thenReturn(summary("0"));

        String body = job(true).alertBodyFor(7L);

        assertThat(body).contains("2 Schedule K-1s are still outstanding for 2025");
        assertThat(body).contains("past the filing deadline");
        assertThat(body).contains("extension");
    }

    @Test
    void flagsUncalledCapitalWithTheRisk() {
        when(k1Service.getYearForUser(7L, 2025)).thenReturn(k1s(0));
        when(holdingService.getSummaryForUser(7L)).thenReturn(summary("25000"));

        String body = job(true).alertBodyFor(7L);

        assertThat(body).contains("$25000");
        assertThat(body).contains("dilute");
    }

    @Test
    void combinesBothConcernsIntoOneMessage() {
        when(k1Service.getYearForUser(7L, 2025)).thenReturn(k1s(1));
        when(holdingService.getSummaryForUser(7L)).thenReturn(summary("25000"));

        String body = job(true).alertBodyFor(7L);

        // One interruption, not two.
        assertThat(body).contains("1 Schedule K-1 is still outstanding");
        assertThat(body).contains("committed capital not yet called");
    }

    // ---- the run itself ----

    @Test
    void sendsOneAlertPerUserWithSomethingOutstanding() {
        when(holdingRepository.findDistinctUserIds()).thenReturn(List.of(7L, 8L));
        when(k1Service.getYearForUser(7L, 2025)).thenReturn(k1s(1));
        when(holdingService.getSummaryForUser(7L)).thenReturn(summary("0"));
        // User 8 has nothing to say.
        when(k1Service.getYearForUser(8L, 2025)).thenReturn(k1s(0));
        when(holdingService.getSummaryForUser(8L)).thenReturn(summary("0"));

        job(true).sendWeeklyAlerts();

        verify(notifier, times(1)).send(eq(7L), any(), any());
        verify(notifier, never()).send(eq(8L), any(), any());
    }

    @Test
    void oneUsersFailureDoesNotStopTheRest() {
        when(holdingRepository.findDistinctUserIds()).thenReturn(List.of(7L, 8L));
        when(k1Service.getYearForUser(7L, 2025)).thenThrow(new RuntimeException("boom"));
        when(k1Service.getYearForUser(8L, 2025)).thenReturn(k1s(3));
        when(holdingService.getSummaryForUser(8L)).thenReturn(summary("0"));

        job(true).sendWeeklyAlerts();

        // The healthy user still gets their alert.
        verify(notifier).send(eq(8L), any(), any());
    }

    @Test
    void doesNothingWhenDisabled() {
        lenient().when(holdingRepository.findDistinctUserIds()).thenReturn(List.of(7L));

        job(false).sendWeeklyAlerts();

        verify(holdingRepository, never()).findDistinctUserIds();
        verify(notifier, never()).send(anyLong(), any(), any());
    }
}
