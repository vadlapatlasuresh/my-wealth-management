package com.mywealthmanagement.authservice.verify;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * How much verification a given disclosure needs. DB-editable so "what needs what" is a table you
 * can read and retune from evidence, not logic buried in controllers (same idea as the permission
 * catalog and the auto-approve threshold). Column is config_key-style — `key` is reserved in H2.
 */
@Entity
@Table(name = "ops_disclosure_tiers")
@Data
@NoArgsConstructor
public class DisclosureTier {

    @Id
    @Column(name = "action_key", length = 64)
    private String actionKey;

    @Column(name = "min_tier", nullable = false)
    private Integer minTier;

    @Column(length = 255)
    private String description;

    // Seeded action keys — the ones the gate checks today.
    public static final String CUSTOMER_STATUS = "customer.status";
    public static final String CUSTOMER_DATA = "customer.data";
    public static final String CUSTOMER_PII = "customer.pii";
    public static final String CUSTOMER_CONTACT_CHANGE = "customer.contact.change";
    public static final String MONEY_MOVEMENT = "money.movement";
}
