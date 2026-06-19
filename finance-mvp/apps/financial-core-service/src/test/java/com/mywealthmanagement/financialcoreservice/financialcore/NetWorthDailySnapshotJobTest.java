package com.mywealthmanagement.financialcoreservice.financialcore;

import com.mywealthmanagement.financialcoreservice.config.JwtService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Unit tests for the daily net-worth snapshot job. */
class NetWorthDailySnapshotJobTest {

    private NetWorthDailySnapshotJob job(NetWorthSnapshotRepository repo,
                                         FinancialCoreService core,
                                         JwtService jwt,
                                         boolean enabled) {
        return new NetWorthDailySnapshotJob(repo, core, jwt, enabled);
    }

    @Test
    void mintsAPerUserTokenAndRefreshesEachUser() {
        NetWorthSnapshotRepository repo = mock(NetWorthSnapshotRepository.class);
        when(repo.findDistinctUserIds()).thenReturn(List.of(1L, 2L));
        JwtService jwt = mock(JwtService.class);
        when(jwt.generateToken("1")).thenReturn("tok1");
        when(jwt.generateToken("2")).thenReturn("tok2");
        FinancialCoreService core = mock(FinancialCoreService.class);

        job(repo, core, jwt, true).refreshAll();

        verify(core).refreshDailySnapshot(eq(1L), eq("Bearer tok1"));
        verify(core).refreshDailySnapshot(eq(2L), eq("Bearer tok2"));
    }

    @Test
    void oneUserFailingDoesNotStopTheRest() {
        NetWorthSnapshotRepository repo = mock(NetWorthSnapshotRepository.class);
        when(repo.findDistinctUserIds()).thenReturn(List.of(1L, 2L));
        JwtService jwt = mock(JwtService.class);
        when(jwt.generateToken(any())).thenReturn("tok");
        FinancialCoreService core = mock(FinancialCoreService.class);
        doThrow(new RuntimeException("boom")).when(core).refreshDailySnapshot(eq(1L), any());

        job(repo, core, jwt, true).refreshAll();

        verify(core).refreshDailySnapshot(eq(2L), any()); // still ran for user 2
    }

    @Test
    void disabledJobDoesNothing() {
        NetWorthSnapshotRepository repo = mock(NetWorthSnapshotRepository.class);
        FinancialCoreService core = mock(FinancialCoreService.class);
        JwtService jwt = mock(JwtService.class);

        job(repo, core, jwt, false).refreshAll();

        verifyNoInteractions(repo, core, jwt);
    }
}
