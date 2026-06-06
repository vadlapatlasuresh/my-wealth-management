package com.mywealthmanagement.accountaggregationservice.plaid.dto;

import lombok.Data;

@Data
public class PublicTokenExchangeRequest {
    private Long userId; // This will be passed from the authenticated user context
    private String publicToken;
}
