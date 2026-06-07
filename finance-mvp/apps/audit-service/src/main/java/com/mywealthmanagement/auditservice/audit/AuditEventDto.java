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
}
