package com.mywealthmanagement.financialcoreservice.invest;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A user-tracked alternative investment (LLC, land, syndication, PE, crypto, etc.).
 * Replaces InvestPage's previous browser-localStorage storage.
 */
@Entity
@Table(name = "alt_investments")
@Data
@NoArgsConstructor
public class AltInvestment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** LLC | Land | Apartments | Private Equity | Crypto | Collectibles | Other */
    private String type;

    @Column(nullable = false)
    private String name;

    /** "value" is a reserved word in H2/SQL, so the column is named current_value. */
    @Column(name = "current_value", precision = 18, scale = 2)
    private BigDecimal value = BigDecimal.ZERO;

    /** Ownership percentage (nullable when not applicable). */
    @Column(name = "ownership_pct", precision = 7, scale = 4)
    private BigDecimal ownershipPct;

    @Column(length = 1000)
    private String notes;

    @CreationTimestamp
    @Column(name = "added_at", nullable = false, updatable = false)
    private LocalDateTime addedAt;
}
