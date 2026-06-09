package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * A bank/credit/loan account attached to a {@link ManualBusiness}.
 */
@Entity
@Table(name = "business_accounts")
@Data
@NoArgsConstructor
public class BusinessAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(nullable = false)
    private String name;

    private String institution;

    /** CHECKING | SAVINGS | CREDIT_CARD | LOAN */
    private String type;

    @Column(precision = 18, scale = 2)
    private BigDecimal balance;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
