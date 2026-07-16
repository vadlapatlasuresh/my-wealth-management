package com.mywealthmanagement.paymentservice.subscription;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One feature a plan grants. `featureKey` is the entitlement checked by feature gating;
 * `enabled` can be toggled in the DB to turn a feature on/off for a plan live.
 */
@Entity
@Table(name = "plan_feature")
@Data
@NoArgsConstructor
public class PlanFeature {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plan_key", nullable = false, length = 50)
    private String planKey;

    @Column(name = "feature_key", nullable = false, length = 120)
    private String featureKey;

    @Column(nullable = false, length = 255)
    private String label;

    @Column(length = 500)
    private String description;

    @Column(nullable = false)
    private Boolean enabled = true;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
