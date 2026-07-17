package com.mywealthmanagement.paymentservice.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DB-editable financial tunables. Same reasoning as the plan catalog and the ops access matrix:
 * a number that should be re-derived from evidence shouldn't need a deploy to change.
 *
 * Columns are config_key/config_value — `key` and `value` are both reserved words in H2, which
 * dev/test run against these same migrations.
 */
@Entity
@Table(name = "ops_finance_config")
@Data
@NoArgsConstructor
public class OpsFinanceConfig {

    @Id
    @Column(name = "config_key", length = 64)
    private String configKey;

    @Column(name = "config_value", nullable = false, length = 255)
    private String configValue;

    @Column(length = 255)
    private String description;

    /** Below this amount an adjustment executes without a second approver. */
    public static final String KEY_AUTO_APPROVE_BELOW_CENTS = "adjustment.auto_approve_below_cents";
}
