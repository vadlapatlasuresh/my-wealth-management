package com.mywealthmanagement.realestateservice.property;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A single actual expense logged against a property (a plumber invoice, cleaning bill,
 * supplies, etc.). Distinct from the monthly carrying-cost estimates on {@link Property}:
 * these are real, dated, categorized transactions used for per-property expense tracking
 * and tax reporting. Ownership is enforced app-side via {@code userId}.
 */
@Entity
@Table(name = "property_expenses")
@Data
@NoArgsConstructor
public class PropertyExpense {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "property_id", nullable = false)
    private Long propertyId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "expense_date", nullable = false)
    private LocalDate expenseDate;

    @Column(nullable = false, length = 60)
    private String category;

    @Column(length = 200)
    private String vendor;

    @Column(length = 500)
    private String description;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "payment_method", length = 40)
    private String paymentMethod;

    // Blank => flagged as "missing receipt" in the UI (mirrors the spreadsheet flag).
    @Column(name = "receipt_ref", length = 120)
    private String receiptRef;

    // Optional labor/time tracking. Labor cost = hours * hourlyRate when both are set.
    @Column(name = "hours")
    private BigDecimal hours;

    @Column(name = "hourly_rate")
    private BigDecimal hourlyRate;

    @Column(length = 1000)
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
