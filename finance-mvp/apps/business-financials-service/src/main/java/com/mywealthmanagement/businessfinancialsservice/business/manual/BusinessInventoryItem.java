package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "business_inventory_items")
@Data
@NoArgsConstructor
public class BusinessInventoryItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(nullable = false)
    private String name;

    @Column(length = 60)
    private String sku;

    @Column(name = "cost_price", precision = 18, scale = 2)
    private BigDecimal costPrice;

    @Column(name = "sell_price", precision = 18, scale = 2)
    private BigDecimal sellPrice;

    @Column(name = "on_hand", nullable = false)
    private Integer onHand = 0;

    @Column(name = "reorder_point")
    private Integer reorderPoint;

    @Column(nullable = false, length = 16)
    private String status = "ACTIVE";

    @Column(length = 1000)
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
