package com.mywealthmanagement.authservice.ops;

import java.util.Arrays;
import java.util.List;

/**
 * The permission catalog — the unit of ops access enforcement.
 *
 * This enum is the SOURCE OF TRUTH for which permissions exist; migration V9 seeds the same keys
 * into `ops_permissions` so the DB (and the ops-admin UI) can describe them. What each ROLE gets
 * is DB-editable (`ops_role_permissions`) and can be retuned without a deploy — but the set of
 * permissions itself is code, because each key is meaningless unless an endpoint checks it.
 *
 * DELIBERATELY ONLY WHAT IS ENFORCED TODAY. It is tempting to pre-declare finance.refund.create
 * and friends, but a permission that gates nothing is worse than no permission: it reads like a
 * control on an access-review spreadsheet while granting exactly the same access to everyone.
 * Phase 5 adds the finance keys together with the endpoints that honour them.
 *
 * Naming: {@code <area>.<object>.<verb>}, lower-case dotted. Used verbatim as a Spring Security
 * authority — {@code @PreAuthorize("hasAuthority('customer.pii.reveal')")}.
 */
public enum OpsPermission {

    // --- Customer records -------------------------------------------------------------------
    CUSTOMER_SEARCH("customer.search", "CUSTOMER",
            "Search for customers by name, email, phone or id"),
    CUSTOMER_VIEW("customer.view", "CUSTOMER",
            "Open a customer record: profile, activity timeline and issues"),
    CUSTOMER_DATA_VIEW("customer.data.view", "CUSTOMER",
            "Read a customer's financial data read-only: accounts, transactions, payments, deals"),
    CUSTOMER_PII_REVEAL("customer.pii.reveal", "CUSTOMER",
            "Unmask a customer's SSN/EIN last-4 and full phone number. Requires a reason; always audited"),

    // --- Oversight --------------------------------------------------------------------------
    AUDIT_QUERY("audit.query", "OVERSIGHT",
            "Query the audit trail across customers, including who accessed whom"),
    OPS_ANALYTICS_VIEW("ops.analytics.view", "OVERSIGHT",
            "View operator analytics and the system health/alert feed"),

    // --- Platform ---------------------------------------------------------------------------
    CPA_MODERATE("cpa.moderate", "PLATFORM",
            "Approve, reject or verify CPA marketplace listings"),
    OPS_USER_MANAGE("ops.user.manage", "PLATFORM",
            "Create and deactivate ops accounts and assign their roles");

    private final String key;
    private final String category;
    private final String description;

    OpsPermission(String key, String category, String description) {
        this.key = key;
        this.category = category;
        this.description = description;
    }

    /** The authority string checked by @PreAuthorize and carried in the JWT `perms` claim. */
    public String key() {
        return key;
    }

    /** Grouping for the ops-admin UI (CUSTOMER | OVERSIGHT | PLATFORM). */
    public String category() {
        return category;
    }

    /** Human-readable meaning — what holding this actually lets someone do. */
    public String description() {
        return description;
    }

    public static List<OpsPermission> all() {
        return Arrays.asList(values());
    }

    /** Look up by wire key, or null if unknown (e.g. a stale key left in the DB). */
    public static OpsPermission fromKey(String key) {
        for (OpsPermission p : values()) {
            if (p.key.equals(key)) return p;
        }
        return null;
    }
}
