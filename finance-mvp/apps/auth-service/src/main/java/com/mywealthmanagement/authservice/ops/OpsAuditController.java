package com.mywealthmanagement.authservice.ops;

import com.mywealthmanagement.authservice.audit.AuditClient;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * The ops-facing audit trail: who accessed whom, and what they did.
 *
 * Lives under /api/v1/ops/audit rather than /api/v1/audit for a specific reason — the gateway's
 * AuditLoggingFilter skips /api/v1/audit/** to avoid recursively auditing its own ingest. Anything
 * served from that prefix is therefore invisible to the trail, and "who read the audit log" is
 * exactly the question compliance asks. Under this prefix, reading the trail is itself audited.
 *
 * audit-service holds the data and is guarded by the internal key; the audit.query permission is
 * enforced here, with the ops identity that the permission belongs to.
 */
@RestController
@RequestMapping("/api/v1/ops/audit")
@RequiredArgsConstructor
public class OpsAuditController {

    private final AuditClient auditClient;

    /**
     * Every recorded action taken against this customer, by anyone, newest first.
     *
     * A null response from audit-service is surfaced as 503, never as an empty list: "no one has
     * ever accessed this customer" and "the audit service is down" must not look identical to
     * someone doing an access review.
     */
    @PreAuthorize("hasAuthority('audit.query')")
    @GetMapping("/target/{userId}")
    public List<Map<String, Object>> targetHistory(@PathVariable String userId,
                                                   @RequestParam(defaultValue = "100") int limit) {
        List<Map<String, Object>> events = auditClient.fetchTargetHistory(userId, clamp(limit));
        if (events == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The audit trail is unavailable — this is NOT a statement that no access occurred.");
        }
        return events;
    }

    /**
     * Everything a given ops user did, across all customers. `distinctTargets` is the cheap signal
     * for the access-review question that actually matters: is this agent opening far more customer
     * records than their peers?
     */
    @PreAuthorize("hasAuthority('audit.query')")
    @GetMapping("/actor/{opsUserId}")
    public Map<String, Object> actorHistory(@PathVariable String opsUserId,
                                            @RequestParam(defaultValue = "30") int days,
                                            @RequestParam(defaultValue = "100") int limit) {
        Map<String, Object> result = auditClient.fetchActorHistory(opsUserId, days, clamp(limit));
        if (result == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The audit trail is unavailable — this is NOT a statement that no access occurred.");
        }
        return result;
    }

    private static int clamp(int limit) {
        return Math.min(Math.max(limit, 1), 500);
    }
}
