package com.mywealthmanagement.auditservice.audit;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "audit_events")
@Data
@NoArgsConstructor
public class AuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", length = 64)
    private String userId;          // JWT subject (userId) or null/anonymous

    @Column(name = "actor_type", length = 20)
    private String actorType;       // USER | OPS | SYSTEM | ANONYMOUS

    // ---- Actor / target -----------------------------------------------------
    // user_id above is the ACTOR (the JWT subject) and is kept as-is for backward compatibility
    // with /audit/me and the member timeline. These columns say it unambiguously, and — crucially
    // — record who was acted UPON, which the request-level capture can never express.

    @Column(name = "actor_kind", length = 20)
    private String actorKind;       // MEMBER | OPS | SYSTEM | ANONYMOUS

    @Column(name = "actor_id", length = 64)
    private String actorId;         // ops_users id when actorKind=OPS, else the customer id

    /** The CUSTOMER this action was performed against. Null for a customer's own actions. */
    @Column(name = "target_user_id", length = 64)
    private String targetUserId;

    /** The actor's stated justification. Required for sensitive ops actions (e.g. PII reveal). */
    @Column(columnDefinition = "TEXT")
    private String reason;

    @Column(name = "before_json", columnDefinition = "TEXT")
    private String beforeJson;

    @Column(name = "after_json", columnDefinition = "TEXT")
    private String afterJson;

    @Column(name = "ticket_ref", length = 64)
    private String ticketRef;

    @Column(nullable = false, length = 160)
    private String action;          // e.g. auth.login.success, GET /api/v1/accounts

    @Column(length = 60)
    private String service;         // target service (derived) or 'gateway'

    @Column(length = 10)
    private String method;

    @Column(length = 512)
    private String path;

    private Integer status;

    @Column(name = "source_ip", length = 64)
    private String sourceIp;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    // Geo-location resolved from source_ip via MaxMind GeoLite2 (nullable when the
    // GeoIP db is not configured or the IP can't be resolved). Derived/enrichment
    // data — intentionally NOT part of the tamper-evident hash (see AuditChainService).
    @Column(name = "geo_city", length = 128)
    private String geoCity;

    @Column(name = "geo_country", length = 128)
    private String geoCountry;

    @Column(name = "latency_ms")
    private Integer latencyMs;

    @Column(length = 20)
    private String outcome;         // SUCCESS | FAILURE | DENIED

    @Column(columnDefinition = "TEXT")
    private String metadata;        // optional JSON

    // Set explicitly by the chain service (so it is part of the hashed content and
    // therefore tamper-evident). Falls back to the DB default if ever left null.
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    // ---- Tamper-evident hash chain -----------------------------------------
    // entry_hash = HMAC-SHA256(key, prev_hash | canonical(content)). prev_hash links to the
    // previous row's entry_hash, so altering any past row breaks every later hash — and because
    // the digest is keyed, an attacker with DB write access cannot simply recompute the chain.
    @Column(name = "prev_hash", length = 64)
    private String prevHash;

    @Column(name = "entry_hash", length = 64)
    private String entryHash;

    /**
     * Which formula produced {@link #entryHash}: 1 = legacy unkeyed SHA-256 over the original
     * field set, 2 = keyed HMAC over the field set including actor/target/reason/before/after.
     * Stored per row so history written under the old rules still verifies under those rules.
     */
    @Column(name = "hash_version", nullable = false)
    private Integer hashVersion = 1;
}
