package com.mywealthmanagement.auditservice.audit;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** Ingest payload (POST) and query response shape. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuditEventDto {
    private Long id;
    private String userId;
    private String actorType;
    private String action;
    private String service;
    private String method;
    private String path;
    private Integer status;
    private String sourceIp;
    private String userAgent;
    private Integer latencyMs;
    private String outcome;
    private String metadata;
    private LocalDateTime createdAt;
    private String geoCity;      // resolved from sourceIp (nullable)
    private String geoCountry;   // resolved from sourceIp (nullable)

    // ---- Actor / target / semantics -----------------------------------------
    // userId above is the ACTOR (kept for backward compatibility). These say so explicitly and,
    // crucially, record who was acted UPON — which request-level capture cannot express.
    private String actorKind;      // MEMBER | OPS | SYSTEM | ANONYMOUS
    private String actorId;        // ops_users id when actorKind=OPS
    private String targetUserId;   // the CUSTOMER acted upon
    private String reason;         // the actor's stated justification
    private String beforeJson;
    private String afterJson;
    private String ticketRef;
    private Integer hashVersion;   // 1 = legacy unkeyed SHA-256, 2 = keyed HMAC
}
