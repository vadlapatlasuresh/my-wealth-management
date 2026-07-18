package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A user's metadata overlay for one vendor of one business: lifecycle status,
 * an optional contract-renewal date, and free-form notes. Vendor spend itself is
 * computed from the ledger — this table only persists the overlay, keyed by name.
 */
@Entity
@Table(
    name = "business_vendors",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "business_id", "vendor_name"})
)
@Data
@NoArgsConstructor
public class BusinessVendor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "vendor_name", nullable = false, length = 200)
    private String vendorName;

    /** ACTIVE | REVIEW | INACTIVE. */
    @Column(name = "status", nullable = false, length = 32)
    private String status = "ACTIVE";

    @Column(name = "renewal_date")
    private LocalDate renewalDate;

    @Column(name = "notes", length = 2000)
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
