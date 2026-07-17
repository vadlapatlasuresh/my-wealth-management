package com.mywealthmanagement.authservice.ops;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** A problem raised on a customer that needs someone other than the agent on the call. */
@Entity
@Table(name = "ops_escalations")
@Data
@NoArgsConstructor
public class OpsEscalation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The CUSTOMER this is about. */
    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(name = "raised_by", nullable = false, length = 64)
    private String raisedBy;

    @Column(nullable = false, length = 16)
    private String severity;

    @Column(nullable = false, length = 255)
    private String summary;

    @Column(columnDefinition = "TEXT")
    private String detail;

    @Column(nullable = false, length = 16)
    private String status = STATUS_OPEN;

    /** ops_users id, or null while it sits in the unassigned queue. */
    @Column(name = "assigned_to", length = 64)
    private String assignedTo;

    @Column(name = "resolved_by", length = 64)
    private String resolvedBy;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @Column(columnDefinition = "TEXT")
    private String resolution;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public static final String STATUS_OPEN = "OPEN";
    public static final String STATUS_RESOLVED = "RESOLVED";

    public static final java.util.List<String> SEVERITIES = java.util.List.of("LOW", "MEDIUM", "HIGH");
}
