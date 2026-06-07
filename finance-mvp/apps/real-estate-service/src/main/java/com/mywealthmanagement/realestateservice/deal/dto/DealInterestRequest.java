package com.mywealthmanagement.realestateservice.deal.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

/** Payload an interested investor submits to express interest in a deal. */
@Data
@NoArgsConstructor
public class DealInterestRequest {
    private String name;
    private String email;
    private String phone;
    private String message;
    private java.math.BigDecimal commitmentAmount;
    private boolean accredited;
}
