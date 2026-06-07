package com.mywealthmanagement.financialcoreservice.financialcore;

import com.mywealthmanagement.financialcoreservice.clients.AccountAggregationClient;
import com.mywealthmanagement.financialcoreservice.clients.RealEstateClient;
import com.mywealthmanagement.financialcoreservice.clients.dtos.AccountDto;
import com.mywealthmanagement.financialcoreservice.clients.dtos.PropertyDto;
import com.mywealthmanagement.financialcoreservice.financialcore.dto.SnapshotDto;
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
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Covers the core money math: net worth must aggregate linked accounts correctly —
 * depository balances add to cash, credit balances add to debt, and the headline total
 * is cash + investments + real-estate equity − credit − loans.
 * <p>
 * The Plaid-backed {@link AccountAggregationClient} is mocked so the test exercises the
 * pure aggregation logic without any network dependency.
 */
@ExtendWith(MockitoExtension.class)
class FinancialCoreServiceTest {

    @Mock
    private AccountAggregationClient accountAggregationClient;

    @Mock
    private RealEstateClient realEstateClient;

    @Mock
    private NetWorthSnapshotRepository snapshotRepository;

    @InjectMocks
    private FinancialCoreService service;

    @BeforeEach
    void setUpAuthenticatedUser() {
        // getUserId() reads the principal name; getAuthorizationHeader() reads credentials.
        var auth = new UsernamePasswordAuthenticationToken(
                "1", "Bearer test-token", AuthorityUtils.NO_AUTHORITIES);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private AccountDto account(String type, BigDecimal balance) {
        AccountDto a = new AccountDto();
        a.setType(type);
        a.setCurrentBalance(balance);
        a.setCurrency("USD");
        return a;
    }

    @Test
    void getSnapshot_aggregatesCashAndCreditIntoNetWorth() {
        when(accountAggregationClient.getAccounts(anyString())).thenReturn(List.of(
                account("depository", new BigDecimal("1000.00")),  // checking
                account("depository", new BigDecimal("500.00")),   // savings
                account("credit", new BigDecimal("200.00"))        // credit card debt
        ));
        when(accountAggregationClient.getTransactions(anyString())).thenReturn(List.of());

        SnapshotDto snapshot = service.getSnapshot("1M");

        // Cash = 1000 + 500; credit debt = 200; net = 1500 - 200 = 1300.
        assertThat(snapshot.getComponents().getCash()).isEqualByComparingTo("1500.00");
        assertThat(snapshot.getComponents().getCreditCards()).isEqualByComparingTo("200.00");
        assertThat(snapshot.getNetWorth().getTotal()).isEqualByComparingTo("1300.00");
        assertThat(snapshot.getUserId()).isEqualTo(1L);
    }

    @Test
    void getSnapshot_withNoAccounts_yieldsZeroNetWorth() {
        when(accountAggregationClient.getAccounts(anyString())).thenReturn(List.of());
        when(accountAggregationClient.getTransactions(anyString())).thenReturn(List.of());

        SnapshotDto snapshot = service.getSnapshot("1M");

        assertThat(snapshot.getNetWorth().getTotal()).isEqualByComparingTo("0");
        assertThat(snapshot.getComponents().getCash()).isEqualByComparingTo("0");
    }

    @Test
    void getSnapshot_includesInvestmentsLoansAndRealEstateEquity() {
        when(accountAggregationClient.getAccounts(anyString())).thenReturn(List.of(
                account("depository", new BigDecimal("1000.00")), // cash
                account("investment", new BigDecimal("5000.00")),  // brokerage
                account("loan", new BigDecimal("3000.00")),        // loan (liability)
                account("credit", new BigDecimal("200.00"))        // credit card (liability)
        ));
        when(accountAggregationClient.getTransactions(anyString())).thenReturn(List.of());

        PropertyDto prop = new PropertyDto();
        prop.setCurrentValue(new BigDecimal("540000"));
        prop.setMortgageBalance(new BigDecimal("360000"));
        prop.setEquity(new BigDecimal("180000"));
        when(realEstateClient.getProperties(anyString())).thenReturn(List.of(prop));

        SnapshotDto s = service.getSnapshot("1Y");

        assertThat(s.getComponents().getInvestments()).isEqualByComparingTo("5000.00");
        assertThat(s.getComponents().getLoans()).isEqualByComparingTo("3000.00");
        assertThat(s.getComponents().getRealEstateEquity()).isEqualByComparingTo("180000");
        // net = cash 1000 + investments 5000 + RE equity 180000 − credit 200 − loans 3000
        assertThat(s.getNetWorth().getTotal()).isEqualByComparingTo("182800.00");
    }
}
