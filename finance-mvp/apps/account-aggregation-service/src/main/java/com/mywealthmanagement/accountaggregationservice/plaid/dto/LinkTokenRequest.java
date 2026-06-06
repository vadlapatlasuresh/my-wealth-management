package com.mywealthmanagement.accountaggregationservice.plaid.dto;

import lombok.Data;

@Data
public class LinkTokenRequest {
    private Long userId; // This will be passed from the authenticated user context
}
