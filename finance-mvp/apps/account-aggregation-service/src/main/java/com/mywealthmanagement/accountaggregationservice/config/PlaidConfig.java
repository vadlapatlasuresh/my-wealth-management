package com.mywealthmanagement.accountaggregationservice.config;

import com.plaid.client.ApiClient;
import com.plaid.client.request.PlaidApi;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class PlaidConfig {

    @Value("${plaid.client-id}")
    private String plaidClientId;

    @Value("${plaid.secret}")
    private String plaidSecret;

    @Value("${plaid.env:sandbox}")
    private String plaidEnv;

    @Bean
    public PlaidApi plaidApi() {
        Map<String, String> apiKeys = new HashMap<>();
        apiKeys.put("clientId", plaidClientId);
        apiKeys.put("secret", plaidSecret);

        ApiClient apiClient = new ApiClient(apiKeys);
        apiClient.setPlaidAdapter(resolvePlaidAdapter(plaidEnv));

        return apiClient.createService(PlaidApi.class);
    }

    static String resolvePlaidAdapter(String env) {
        if (env == null) {
            return ApiClient.Sandbox;
        }
        String normalized = env.trim().split("#")[0].trim().toLowerCase();
        return switch (normalized) {
            case "production", "prod" -> ApiClient.Production;
            // Plaid retired the standalone Development environment; map it to Sandbox.
            default -> ApiClient.Sandbox;
        };
    }
}
