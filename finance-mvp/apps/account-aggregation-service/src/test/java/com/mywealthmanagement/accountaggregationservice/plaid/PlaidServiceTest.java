package com.mywealthmanagement.accountaggregationservice.plaid;

import com.mywealthmanagement.accountaggregationservice.account.AccountRepository;
import com.mywealthmanagement.accountaggregationservice.plaid.dto.LinkTokenRequest;
import com.mywealthmanagement.accountaggregationservice.transaction.TransactionRepository;
import com.plaid.client.model.LinkTokenCreateResponse;
import com.plaid.client.request.PlaidApi;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import retrofit2.Call;
import retrofit2.Response;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
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

    private PlaidService plaidService;

    @BeforeEach
    void setUp() {
        plaidService = new PlaidService(
                plaidApi,
                plaidItemRepository,
                accountRepository,
                transactionRepository
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
}
