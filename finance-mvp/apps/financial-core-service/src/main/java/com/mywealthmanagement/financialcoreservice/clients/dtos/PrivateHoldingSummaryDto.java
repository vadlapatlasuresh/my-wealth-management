package com.mywealthmanagement.financialcoreservice.clients.dtos;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * Minimal view of the user's private co-ownership positions, as returned by
 * real-estate-service.
 *
 * <p>Only {@code netWorthValue} is consumed here: real-estate-service already decides whether
 * that is the holder's own estimate or the capital still at risk, so this service never has to
 * repeat that judgement.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PrivateHoldingSummaryDto {
    private int holdingCount;
    private BigDecimal netWorthValue;
    private BigDecimal contributed;
    private BigDecimal unreturnedCapital;
}
