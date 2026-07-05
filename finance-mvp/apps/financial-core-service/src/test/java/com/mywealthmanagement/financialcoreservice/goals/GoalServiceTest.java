package com.mywealthmanagement.financialcoreservice.goals;

import com.mywealthmanagement.financialcoreservice.clients.AccountAggregationClient;
import com.mywealthmanagement.financialcoreservice.clients.dtos.AccountDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.Mockito.when;

/**
 * Exercises the goal-tracking math: a goal's saved amount is the stored manual base plus the
 * auto-tracked portion pulled from its linked accounts, and how that auto portion is derived
 * depends on the tracking mode (MANUAL / BALANCE / CONTRIBUTIONS). The account-aggregation
 * client is mocked so we test the pure computation with no network.
 */
@ExtendWith(MockitoExtension.class)
class GoalServiceTest {

    @Mock private GoalRepository goalRepository;
    @Mock private GoalAccountLinkRepository linkRepository;
    @Mock private GoalContributionRepository contributionRepository;
    @Mock private AccountAggregationClient accountAggregationClient;

    @InjectMocks private GoalService service;

    @BeforeEach
    void auth() {
        var auth = new UsernamePasswordAuthenticationToken(
                "1", "Bearer test-token", AuthorityUtils.NO_AUTHORITIES);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private Goal goal(String mode, BigDecimal manualBase, BigDecimal target, String currency) {
        Goal g = new Goal();
        g.setId(10L);
        g.setUserId(1L);
        g.setName("Vacation");
        g.setGoalType("SAVINGS");
        g.setTrackingMode(mode);
        g.setCurrentAmount(manualBase);
        g.setTargetAmount(target);
        g.setCurrency(currency);
        return g;
    }

    private GoalAccountLink link(Long accountId, BigDecimal baseline, BigDecimal lastBalance, String ccy) {
        GoalAccountLink l = new GoalAccountLink();
        l.setId(accountId);
        l.setGoalId(10L);
        l.setUserId(1L);
        l.setAccountId(accountId);
        l.setBaselineAmount(baseline);
        l.setLastBalance(lastBalance);
        l.setCurrency(ccy);
        return l;
    }

    private AccountDto account(Long id, BigDecimal balance, String ccy) {
        return new AccountDto(id, "plaid-" + id, "Ally Savings", "Ally Savings",
                "savings", "depository", balance, balance, ccy);
    }

    @Test
    void manualMode_ignoresLinkedBalances() {
        Goal g = goal(GoalService.MODE_MANUAL, new BigDecimal("5000"), new BigDecimal("20000"), null);
        when(linkRepository.findByGoalIdAndUserId(10L, 1L))
                .thenReturn(List.of(link(100L, BigDecimal.ZERO, new BigDecimal("9999"), "USD")));

        GoalDto dto = service.toDto(g, java.util.Map.of(100L, account(100L, new BigDecimal("9999"), "USD")));

        assertThat(dto.getSavedAmount()).isEqualByComparingTo("5000"); // only manual base counts
        assertThat(dto.getLinkedBalance()).isEqualByComparingTo("0");
        assertThat(dto.getProgress()).isCloseTo(0.25, within(1e-6));
    }

    @Test
    void balanceMode_addsFullLinkedBalanceOnTopOfManual() {
        Goal g = goal(GoalService.MODE_BALANCE, new BigDecimal("1000"), new BigDecimal("20000"), "USD");
        when(linkRepository.findByGoalIdAndUserId(10L, 1L))
                .thenReturn(List.of(link(100L, new BigDecimal("2000"), null, "USD")));

        GoalDto dto = service.toDto(g, java.util.Map.of(100L, account(100L, new BigDecimal("8000"), "USD")));

        assertThat(dto.getLinkedBalance()).isEqualByComparingTo("8000"); // full balance
        assertThat(dto.getSavedAmount()).isEqualByComparingTo("9000");   // 1000 manual + 8000
        assertThat(dto.getProgress()).isCloseTo(0.45, within(1e-6));
    }

    @Test
    void contributionsMode_countsOnlyGrowthSinceBaseline() {
        Goal g = goal(GoalService.MODE_CONTRIBUTIONS, BigDecimal.ZERO, new BigDecimal("10000"), "USD");
        when(linkRepository.findByGoalIdAndUserId(10L, 1L))
                .thenReturn(List.of(link(100L, new BigDecimal("3000"), null, "USD"))); // baseline 3000

        GoalDto dto = service.toDto(g, java.util.Map.of(100L, account(100L, new BigDecimal("5000"), "USD")));

        assertThat(dto.getLinkedBalance()).isEqualByComparingTo("2000"); // 5000 - 3000 baseline
        assertThat(dto.getSavedAmount()).isEqualByComparingTo("2000");
    }

    @Test
    void contributionsMode_neverGoesNegativeWhenBalanceDropsBelowBaseline() {
        Goal g = goal(GoalService.MODE_CONTRIBUTIONS, BigDecimal.ZERO, new BigDecimal("10000"), "USD");
        when(linkRepository.findByGoalIdAndUserId(10L, 1L))
                .thenReturn(List.of(link(100L, new BigDecimal("3000"), null, "USD")));

        GoalDto dto = service.toDto(g, java.util.Map.of(100L, account(100L, new BigDecimal("1000"), "USD")));

        assertThat(dto.getLinkedBalance()).isEqualByComparingTo("0"); // floored, not -2000
    }

    @Test
    void balanceMode_usesLastKnownBalanceWhenAggregationUnreachable() {
        Goal g = goal(GoalService.MODE_BALANCE, BigDecimal.ZERO, new BigDecimal("10000"), "USD");
        when(linkRepository.findByGoalIdAndUserId(10L, 1L))
                .thenReturn(List.of(link(100L, BigDecimal.ZERO, new BigDecimal("4200"), "USD")));

        // No live account for id 100 -> falls back to last_balance and flags the link stale.
        GoalDto dto = service.toDto(g, java.util.Map.of());

        assertThat(dto.getSavedAmount()).isEqualByComparingTo("4200");
        assertThat(dto.getLinkedAccounts()).hasSize(1);
        assertThat(dto.getLinkedAccounts().get(0).getStale()).isTrue();
    }

    @Test
    void balanceMode_skipsAccountInDifferentCurrencyAndFlagsMismatch() {
        Goal g = goal(GoalService.MODE_BALANCE, new BigDecimal("500"), new BigDecimal("10000"), "USD");
        when(linkRepository.findByGoalIdAndUserId(10L, 1L))
                .thenReturn(List.of(link(100L, BigDecimal.ZERO, null, "EUR")));

        GoalDto dto = service.toDto(g, java.util.Map.of(100L, account(100L, new BigDecimal("8000"), "EUR")));

        assertThat(dto.getLinkedBalance()).isEqualByComparingTo("0"); // EUR account skipped
        assertThat(dto.getSavedAmount()).isEqualByComparingTo("500"); // only USD manual base
        assertThat(dto.getCurrencyMismatch()).isTrue();
    }

    @Test
    void progressIsCappedAtOneWhenOverfunded() {
        Goal g = goal(GoalService.MODE_BALANCE, BigDecimal.ZERO, new BigDecimal("1000"), "USD");
        when(linkRepository.findByGoalIdAndUserId(10L, 1L))
                .thenReturn(List.of(link(100L, BigDecimal.ZERO, null, "USD")));

        GoalDto dto = service.toDto(g, java.util.Map.of(100L, account(100L, new BigDecimal("2500"), "USD")));

        assertThat(dto.getSavedAmount()).isEqualByComparingTo("2500"); // true amount preserved
        assertThat(dto.getProgress()).isEqualTo(1.0);                  // bar capped
    }
}
