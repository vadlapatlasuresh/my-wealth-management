package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "business_contractors")
@Data
@NoArgsConstructor
public class BusinessContractor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(nullable = false)
    private String name;

    @Column(length = 255)
    private String email;

    @Column(length = 40)
    private String phone;

    @Column(name = "tax_form", length = 24)
    private String taxForm = "1099";

    @Column(precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(name = "payment_terms", length = 40)
    private String paymentTerms;

    @Column(nullable = false, length = 16)
    private String status = "ACTIVE";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
