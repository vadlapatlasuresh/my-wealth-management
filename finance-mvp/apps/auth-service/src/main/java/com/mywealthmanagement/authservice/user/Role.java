package com.mywealthmanagement.authservice.user;

/**
 * Roles a CUSTOMER can hold. Staff roles live in {@link com.mywealthmanagement.authservice.ops.OpsRole}
 * on a separate account — the two never mix.
 *
 * ADMIN and CARE used to live here. They were removed (and revoked from every customer row by
 * migration V8) because a customer holding a staff role got a token that every service on the
 * platform trusts — the JWT secret is shared — which made "separate ops access" a role check on
 * one URL prefix rather than a real boundary. Do not re-add them: staff access means an
 * {@code ops_users} account, not a flag on a customer.
 */
public enum Role {
    USER
}
