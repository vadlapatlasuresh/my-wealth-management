package com.mywealthmanagement.authservice.verify;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** One verification attempt — pass or fail. Failures are the fraud signal; both feed the timeline. */
@Entity
@Table(name = "ops_verification_attempts")
@Data
@NoArgsConstructor
public class VerificationAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "agent_id", nullable = false, length = 64)
    private String agentId;

    @Column(name = "customer_id", nullable = false, length = 64)
    private String customerId;

    @Column(nullable = false, length = 24)
    private String method;

    @Column(nullable = false, length = 16)
    private String outcome;

    /** e.g. the KBA fact asked ("date_of_birth") — never the answer. */
    @Column(length = 255)
    private String detail;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public static final String OUTCOME_PASS = "PASS";
    public static final String OUTCOME_FAIL = "FAIL";
    public static final String METHOD_OTP = "OTP";
    public static final String METHOD_KBA = "KBA";
}
