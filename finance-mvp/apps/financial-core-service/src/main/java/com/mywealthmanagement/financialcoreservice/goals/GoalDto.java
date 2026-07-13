package com.mywealthmanagement.financialcoreservice.goals;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class GoalDto {
    private Long id;

    @NotBlank(message = "name is required")
    @Size(max = 200, message = "name must be at most 200 characters")
    private String name;

    @Size(max = 100, message = "goalType must be at most 100 characters")
    private String goalType;

    // MANUAL | BALANCE | CONTRIBUTIONS — how auto progress is derived from linked accounts.
    @Size(max = 20, message = "trackingMode must be at most 20 characters")
    private String trackingMode;

    @Size(max = 3, message = "currency must be a 3-letter code")
    private String currency;

    @PositiveOrZero(message = "targetAmount must be zero or positive")
    private BigDecimal targetAmount;

    // The stored manual base (hand-entered / +$ top-ups). Auto-tracked balances are added on top.
    @PositiveOrZero(message = "currentAmount must be zero or positive")
    private BigDecimal currentAmount;

    private LocalDate targetDate;

    @PositiveOrZero(message = "monthlyContribution must be zero or positive")
    private BigDecimal monthlyContribution;

    // Accounts to link at create time (optional). Read back via linkedAccounts.
    private List<Long> accountIds;

    // ---- DEBT_PAYOFF (mortgage) inputs ----
    private Long propertyId;      // pay off this property's mortgage (from the Properties tab)
    private Long loanAccountId;   // ...or this linked Plaid loan/mortgage account

    @PositiveOrZero(message = "mortgageApr must be zero or positive")
    private BigDecimal mortgageApr;      // APR %, auto-filled from a property or entered for an account

    @PositiveOrZero(message = "monthlyPayment must be zero or positive")
    private BigDecimal monthlyPayment;   // scheduled P&I payment

    @PositiveOrZero(message = "extraPayment must be zero or positive")
    private BigDecimal extraPayment;     // planned extra monthly payment (what-if)

    // ---- Derived (read-only) ----
    // Effective amount saved toward the goal = manual base + auto-tracked linked balances.
    private BigDecimal savedAmount;
    // The auto-tracked portion contributed by linked accounts (0 in MANUAL mode).
    private BigDecimal linkedBalance;
    // Share of the target reached, 0..1 (capped).
    private Double progress;
    // True if any linked account was skipped because its currency differs from the goal's.
    private Boolean currencyMismatch;
    // The linked accounts and what each currently contributes.
    private List<GoalLinkDto> linkedAccounts;

    // ---- Derived (read-only) for DEBT_PAYOFF goals ----
    private String payoffSource;         // "PROPERTY" | "ACCOUNT" | null
    private String payoffLabel;          // e.g. property address / loan account name
    private BigDecimal startingBalance;  // balance owed when the goal started
    private BigDecimal currentBalance;   // live balance owed now
    private BigDecimal paidOff;          // startingBalance - currentBalance (>= 0)
    private Boolean payoffStale;         // true if the live balance couldn't be fetched
}
