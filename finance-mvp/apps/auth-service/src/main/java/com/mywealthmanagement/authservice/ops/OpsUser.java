package com.mywealthmanagement.authservice.ops;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.Set;

/**
 * An internal ops/staff account. Deliberately NOT a {@link com.mywealthmanagement.authservice.user.User}:
 * separate table, separate credential, separate login route, separate token type.
 *
 * Holding an OpsUser grants no member access whatsoever. If an ops staffer is also a TerraVest
 * customer, that is a completely unrelated row in `users` with its own password.
 */
@Entity
@Table(name = "ops_users")
@Data
@NoArgsConstructor
public class OpsUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "name")
    private String name;

    @Column(name = "phone")
    private String phone;

    /** EMAIL | SMS. MFA itself is not optional for ops — this only picks the channel. */
    @Column(name = "mfa_channel", length = 10, nullable = false)
    private String mfaChannel = "EMAIL";

    /** Deactivated accounts keep their audit history but cannot log in. Ops users are never deleted. */
    @Column(name = "active", nullable = false)
    private Boolean active = true;

    @Column(name = "failed_login_attempts", nullable = false)
    private Integer failedLoginAttempts = 0;

    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    /** The ops user id that created this account, or 'BOOTSTRAP' for the very first one. */
    @Column(name = "created_by", length = 64)
    private String createdBy;

    @ElementCollection(targetClass = OpsRole.class, fetch = FetchType.EAGER)
    @CollectionTable(name = "ops_user_roles", joinColumns = @JoinColumn(name = "ops_user_id"))
    @Enumerated(EnumType.STRING)
    private Set<OpsRole> roles;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /** True while a lockout from repeated failed logins is still in force. */
    public boolean isLocked() {
        return lockedUntil != null && lockedUntil.isAfter(LocalDateTime.now());
    }

    /** Role names for the JWT roles claim, e.g. ["OPS_AGENT"]. */
    public java.util.List<String> roleNames() {
        return roles == null ? java.util.List.of() : roles.stream().map(Enum::name).toList();
    }
}
