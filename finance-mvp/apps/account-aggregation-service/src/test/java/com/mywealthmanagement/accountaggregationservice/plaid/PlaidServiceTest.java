package com.mywealthmanagement.accountaggregationservice.plaid;

import com.mywealthmanagement.accountaggregationservice.account.AccountRepository;
import com.mywealthmanagement.accountaggregationservice.holding.HoldingRepository;
import com.mywealthmanagement.accountaggregationservice.holding.InvestmentTransactionRepository;
import com.mywealthmanagement.accountaggregationservice.plaid.dto.LinkTokenRequest;
import com.mywealthmanagement.accountaggregationservice.transaction.TransactionRepository;
import com.plaid.client.model.LinkTokenCreateRequest;
import com.plaid.client.model.LinkTokenCreateResponse;
import com.plaid.client.model.Products;
import com.plaid.client.request.PlaidApi;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import retrofit2.Call;
import retrofit2.Response;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlaidServiceTest {

    @Mock
    private PlaidApi plaidApi;

    @Mock
    private PlaidItemRepository plaidItemRepository;

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private TransactionRepository transactionRepository;

    @Mock
    private HoldingRepository holdingRepository;

    @Mock
    private InvestmentTransactionRepository investmentTransactionRepository;

    @Mock
    private com.mywealthmanagement.accountaggregationservice.comms.NotificationClient notificationClient;

    private PlaidService plaidService;

    @BeforeEach
    void setUp() {
        plaidService = new PlaidService(
                plaidApi,
                plaidItemRepository,
                accountRepository,
                transactionRepository,
                holdingRepository,
                investmentTransactionRepository,
                notificationClient
        );
        ReflectionTestUtils.setField(plaidService, "plaidClientName", "My Wealth Management");
        ReflectionTestUtils.setField(plaidService, "plaidWebhookUrl", "");
    }

    @Test
    void createLinkToken_returnsTokenFromPlaid() throws Exception {
        LinkTokenCreateResponse body = new LinkTokenCreateResponse().linkToken("link-sandbox-test");
        @SuppressWarnings("unchecked")
        Call<LinkTokenCreateResponse> call = mock(Call.class);
        when(plaidApi.linkTokenCreate(any())).thenReturn(call);
        when(call.execute()).thenReturn(Response.success(body));

        LinkTokenRequest request = new LinkTokenRequest();
        request.setUserId(1L);

        String token = plaidService.createLinkToken(request);

        assertEquals("link-sandbox-test", token);
    }

    @Test
    void createLinkToken_allowsAllAccountTypes_notJustDepository() throws Exception {
        LinkTokenCreateResponse body = new LinkTokenCreateResponse().linkToken("link-sandbox-test");
        @SuppressWarnings("unchecked")
        Call<LinkTokenCreateResponse> call = mock(Call.class);
        when(plaidApi.linkTokenCreate(any())).thenReturn(call);
        when(call.execute()).thenReturn(Response.success(body));

        LinkTokenRequest request = new LinkTokenRequest();
        request.setUserId(1L);
        plaidService.createLinkToken(request);

        ArgumentCaptor<LinkTokenCreateRequest> captor = ArgumentCaptor.forClass(LinkTokenCreateRequest.class);
        verify(plaidApi).linkTokenCreate(captor.capture());
        LinkTokenCreateRequest sent = captor.getValue();

        // TRANSACTIONS is supported by every account type, so it must be the only required
        // product. AUTH is depository-only — if it were required, Plaid Link would hide
        // credit cards/loans/investments (the original bug), so it must NOT be required.
        assertEquals(java.util.List.of(Products.TRANSACTIONS), sent.getProducts());
        assertFalse(sent.getProducts().contains(Products.AUTH),
                "AUTH must not be a required product or non-depository accounts can't be linked");
        // AUTH (ACH details), LIABILITIES (card due dates) and INVESTMENTS (brokerage
        // holdings) are collected when the account supports them.
        assertTrue(sent.getOptionalProducts().contains(Products.AUTH));
        assertTrue(sent.getOptionalProducts().contains(Products.LIABILITIES));
        assertTrue(sent.getOptionalProducts().contains(Products.INVESTMENTS));
    }
}
