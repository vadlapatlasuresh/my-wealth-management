package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One billable milestone on a {@link BusinessProject} (order-to-cash, Phase 1.4b). Billing
 * it generates a {@link BusinessInvoice} for {@link #amount} and flips status to INVOICED.
 *
 * <p>status: PENDING | INVOICED
 */
@Entity
@Table(name = "business_project_milestones")
@Data
@NoArgsConstructor
public class BusinessProjectMilestone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private int position;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount = BigDecimal.ZERO;

    /** Optional: percent of the contract this milestone represents (metadata only). */
    @Column(precision = 7, scale = 4)
    private BigDecimal percent;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(nullable = false, length = 12)
    private String status = "PENDING";

    @Column(name = "invoice_id")
    private Long invoiceId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
