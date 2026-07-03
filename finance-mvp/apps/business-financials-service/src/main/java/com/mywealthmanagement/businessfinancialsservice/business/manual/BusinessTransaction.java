package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A real, persisted transaction on a {@link BusinessAccount}.
 *
 * <p>Amount sign convention: negative = money out (a charge/expense),
 * positive = money in (a deposit or card payment). This lets the same table
 * back checking/savings activity and credit-card charges uniformly.
 */
@Entity
@Table(name = "business_transactions")
@Data
@NoArgsConstructor
public class BusinessTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "account_id", nullable = false)
    private Long accountId;

    @Column(nullable = false)
    private String description;

    private String merchant;

    private String category;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(name = "posted_at", nullable = false)
    private LocalDate postedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
