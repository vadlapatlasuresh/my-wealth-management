package com.mywealthmanagement.accountaggregationservice.config;

import com.plaid.client.ApiClient;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PlaidConfigTest {

    @Test
    void resolvePlaidAdapter_handlesSandboxAndComments() {
        assertEquals(ApiClient.Sandbox, PlaidConfig.resolvePlaidAdapter("sandbox"));
        assertEquals(ApiClient.Sandbox, PlaidConfig.resolvePlaidAdapter("sandbox # comment"));
        // Plaid retired the Development environment; it now resolves to Sandbox.
        assertEquals(ApiClient.Sandbox, PlaidConfig.resolvePlaidAdapter("development"));
        assertEquals(ApiClient.Production, PlaidConfig.resolvePlaidAdapter("production"));
    }
}
