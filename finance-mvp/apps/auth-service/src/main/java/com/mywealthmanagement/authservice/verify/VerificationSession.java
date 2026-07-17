package com.mywealthmanagement.authservice.verify;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * One caller-verification session: what the person on the phone has proven, this call.
 *
 * Scoped to (agent, customer) and time-boxed. It is NOT a property of the customer — verifying a
 * caller marks this conversation, not the account. The next call starts cold.
 *
 * See DOCUMENTATION/proposals/ops-caller-verification.md.
 */
@Entity
@Table(name = "ops_verification_sessions")
@Data
@NoArgsConstructor
public class VerificationSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** ops_users id of the agent on the call. */
    @Column(name = "agent_id", nullable = false, length = 64)
    private String agentId;

    /** The customer whose identity is being verified. */
    @Column(name = "customer_id", nullable = false, length = 64)
    private String customerId;

    /** 0 unverified · 1 identity(KBA) · 2 possession(OTP) · 3 step-up. See {@link Tier}. */
    @Column(nullable = false)
    private Integer tier = 0;

    @Column(length = 24)
    private String method;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "verified_at")
    private LocalDateTime verifiedAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /** Frozen by "can't verify / suspicious" — cannot be raised again this call. */
    @Column(nullable = false)
    private Boolean frozen = false;

    /** The effective tier RIGHT NOW: 0 if expired or frozen, whatever it reached otherwise. */
    public int effectiveTier() {
        if (Boolean.TRUE.equals(frozen)) return 0;
        if (expiresAt != null && expiresAt.isBefore(LocalDateTime.now())) return 0;
        return tier == null ? 0 : tier;
    }

    /** The disclosure tiers. Kept as plain ints in the DB (retunable mapping); named here. */
    public static final class Tier {
        private Tier() {}
        public static final int UNVERIFIED = 0;
        public static final int IDENTITY = 1;   // KBA
        public static final int POSSESSION = 2; // OTP to registered device
        public static final int STEP_UP = 3;    // fresh challenge for the riskiest actions
    }
}
