package com.mywealthmanagement.authservice.ops;

/**
 * Roles an internal ops user can hold. Distinct from {@link com.mywealthmanagement.authservice.user.Role},
 * which describes customers — the two never mix.
 *
 * Phase 2 turns these into DB-editable bundles of fine-grained permission strings
 * (customer.pii.reveal, finance.adjustment.approve, …). Until then a role IS the unit of
 * enforcement, so the split below is chosen to make that later refactor additive rather than
 * a re-think: note that FINANCE can create money movements but not approve them, and
 * SUPERVISOR can approve but not create. That separation is the point, not an accident.
 */
public enum OpsRole {

    /** Front-line support: find a customer, read their record, leave notes, raise flags. No money. */
    OPS_AGENT,

    /** Agent + account status changes, PII reveal, audit queries, and approval of money movements. */
    OPS_SUPERVISOR,

    /** Finance ops: the ledger, refunds/credits/adjustments, disputes. Cannot approve its own work. */
    OPS_FINANCE,

    /** Read-only oversight: sees everything including the audit trail, changes nothing. */
    OPS_COMPLIANCE,

    /** Manages ops accounts and role assignment. */
    OPS_ADMIN;

    /** The Spring Security authority for this role (authorities are ROLE_-prefixed by convention). */
    public String authority() {
        return "ROLE_" + name();
    }
}
