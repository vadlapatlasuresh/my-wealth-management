package com.mywealthmanagement.accountaggregationservice;

import com.plaid.client.request.PlaidApi;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

@SpringBootTest
class AccountAggregationServiceApplicationTests {

    @MockBean
    private PlaidApi plaidApi;

    @Test
    void contextLoads() {
    }
}
