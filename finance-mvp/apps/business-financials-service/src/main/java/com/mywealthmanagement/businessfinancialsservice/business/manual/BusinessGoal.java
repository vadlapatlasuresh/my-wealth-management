package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A business's financial goals: a target cash reserve and a tax set-aside plan
 * ({@code taxRate} % of net profit, and how much has actually been set aside).
 * One row per (user, business); the UI tracks progress against these.
 */
@Entity
@Table(
    name = "business_goals",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "business_id"})
)
@Data
@NoArgsConstructor
public class BusinessGoal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "reserve_target", nullable = false, precision = 14, scale = 2)
    private BigDecimal reserveTarget = BigDecimal.ZERO;

    @Column(name = "tax_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal taxRate = BigDecimal.ZERO;

    @Column(name = "tax_set_aside", nullable = false, precision = 14, scale = 2)
    private BigDecimal taxSetAside = BigDecimal.ZERO;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
