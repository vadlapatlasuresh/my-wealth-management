package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** One stock change on an inventory item (Phase 4). Backs idempotent + auditable ledger postings. */
@Entity
@Table(name = "business_inventory_movements")
@Data
@NoArgsConstructor
public class BusinessInventoryMovement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "item_id", nullable = false)
    private Long itemId;

    /** RECEIVE | SELL | ADJUST */
    @Column(nullable = false, length = 12)
    private String kind;

    @Column(nullable = false)
    private int delta;

    @Column(name = "unit_cost", precision = 18, scale = 2)
    private BigDecimal unitCost;

    @Column(length = 300)
    private String note;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
