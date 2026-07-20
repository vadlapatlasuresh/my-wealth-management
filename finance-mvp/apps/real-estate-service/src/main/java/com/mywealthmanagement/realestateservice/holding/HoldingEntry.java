package com.mywealthmanagement.realestateservice.holding;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One movement of money on a {@link PrivateHolding}: capital the user put in, or a
 * distribution they were paid.
 *
 * <p>Both directions live in a single ledger because the capital account only makes sense
 * as their running combination — contributed less capital returned is the unreturned basis,
 * and that is the number an LP actually cares about.
 *
 * <p>Distributions are categorised because their <em>tax treatment differs</em>: rental
 * income is ordinary, return of capital reduces basis rather than being income, and sale
 * proceeds are a gain. Storing one undifferentiated "distribution" number would make the
 * ledger useless at tax time, which is the main reason to keep it at all.
 */
@Entity
@Table(name = "private_holding_entries")
@Data
@NoArgsConstructor
public class HoldingEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "holding_id", nullable = false)
    private Long holdingId;

    // Denormalized so an entry can be authorized without loading its holding.
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** CONTRIBUTION (money in) | DISTRIBUTION (money out to the user). */
    @Column(nullable = false, length = 20)
    private String direction;

    /**
     * CONTRIBUTION: INITIAL | CAPITAL_CALL.
     * DISTRIBUTION: RENTAL_INCOME | RETURN_OF_CAPITAL | CAPITAL_GAIN | REFINANCE | SALE_PROCEEDS.
     */
    @Column(nullable = false, length = 30)
    private String category;

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal amount;

    @Column(name = "occurred_on", nullable = false)
    private LocalDate occurredOn;

    @Column(length = 500)
    private String note;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
