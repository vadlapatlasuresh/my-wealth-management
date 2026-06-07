package com.mywealthmanagement.financialcoreservice.financialcore;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** One persisted net-worth datapoint per user per day (real history). */
@Entity
@Table(name = "net_worth_snapshots",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "snapshot_date"}))
@Data
@NoArgsConstructor
public class NetWorthSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "snapshot_date", nullable = false)
    private LocalDate snapshotDate;

    @Column(nullable = false)
    private BigDecimal total = BigDecimal.ZERO;

    @Column(nullable = false)
    private BigDecimal cash = BigDecimal.ZERO;

    @Column(nullable = false)
    private BigDecimal investments = BigDecimal.ZERO;

    @Column(name = "credit_cards", nullable = false)
    private BigDecimal creditCards = BigDecimal.ZERO;

    @Column(nullable = false)
    private BigDecimal loans = BigDecimal.ZERO;

    @Column(name = "real_estate_value", nullable = false)
    private BigDecimal realEstateValue = BigDecimal.ZERO;

    @Column(name = "real_estate_equity", nullable = false)
    private BigDecimal realEstateEquity = BigDecimal.ZERO;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
