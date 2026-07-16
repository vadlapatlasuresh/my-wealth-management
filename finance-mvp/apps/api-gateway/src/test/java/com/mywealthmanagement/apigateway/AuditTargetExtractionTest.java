package com.mywealthmanagement.apigateway;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The gateway's blanket capture is the only thing that sees EVERY ops request, so the customer id
 * it pulls out of the path is load-bearing for "who touched customer 42".
 *
 * It is also string parsing against route shapes defined in another service — exactly the kind of
 * thing that breaks silently when someone adds a route. These tests pin both halves: the shapes it
 * must recognise, and the ones where it must return null rather than guess. A wrong id here would
 * read as a factual access record in an audit; null just means "this row names no target".
 */
class AuditTargetExtractionTest {

    @Test
    void extractsTargetFromSupportUserRoutes() {
        assertEquals("42", AuditLoggingFilter.targetUserIdFrom("/api/v1/support/users/42"));
        assertEquals("42", AuditLoggingFilter.targetUserIdFrom("/api/v1/support/users/42/activity"));
        assertEquals("42", AuditLoggingFilter.targetUserIdFrom("/api/v1/support/users/42/pii"));
    }

    @Test
    void extractsTargetFromPerServiceSupportRoutes() {
        assertEquals("7", AuditLoggingFilter.targetUserIdFrom("/api/v1/aggregation/support/7/accounts"));
        assertEquals("7", AuditLoggingFilter.targetUserIdFrom("/api/v1/aggregation/support/7/transactions"));
        assertEquals("7", AuditLoggingFilter.targetUserIdFrom("/api/v1/payments/support/7/bill-pay-intents"));
        assertEquals("7", AuditLoggingFilter.targetUserIdFrom("/api/v1/deals/support/7"));
    }

    @Test
    void returnsNullWhenThereIsNoTarget() {
        // A search targets nobody in particular.
        assertNull(AuditLoggingFilter.targetUserIdFrom("/api/v1/support/users"));
        assertNull(AuditLoggingFilter.targetUserIdFrom("/api/v1/support/users?query=alice"));
        // Ops-admin routes act on ops accounts, not customers.
        assertNull(AuditLoggingFilter.targetUserIdFrom("/api/v1/ops/admin/users"));
        assertNull(AuditLoggingFilter.targetUserIdFrom("/api/v1/ops/auth/me"));
        // Member routes: the actor IS the subject, so there is no separate target.
        assertNull(AuditLoggingFilter.targetUserIdFrom("/api/v1/me/snapshot"));
        assertNull(AuditLoggingFilter.targetUserIdFrom(null));
    }

    @Test
    void refusesToGuessOnUnrecognisedShapes() {
        // Non-numeric where an id belongs: return null rather than invent a target.
        assertNull(AuditLoggingFilter.targetUserIdFrom("/api/v1/support/users/me"));
        assertNull(AuditLoggingFilter.targetUserIdFrom("/api/v1/aggregation/support/all/accounts"));
        // "support" in the wrong position is not a support route.
        assertNull(AuditLoggingFilter.targetUserIdFrom("/api/v1/content/support/42"));
    }
}
