package com.mywealthmanagement.financialcoreservice.goals;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * A goal↔account link. On the request path only {@code accountId} is required; the rest are
 * read-only and populated from live account data when the goal is returned.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class GoalLinkDto {
    @NotNull(message = "accountId is required")
    private Long accountId;

    private String accountName;
    private String currency;
    private BigDecimal balance;        // live balance (or last-seen when aggregation is unreachable)
    private BigDecimal baselineAmount; // balance when linked (the zero-point for CONTRIBUTIONS mode)
    private BigDecimal contributes;    // what this account currently adds to the goal under its mode
    private Boolean stale;             // true if balance is a fallback because the live fetch failed
    private Boolean currencyMismatch;  // true if skipped because its currency differs from the goal's
}
