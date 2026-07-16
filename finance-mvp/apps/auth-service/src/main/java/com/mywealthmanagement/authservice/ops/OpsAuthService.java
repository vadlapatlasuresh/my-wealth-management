package com.mywealthmanagement.authservice.ops;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.auth.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Credential handling for internal ops accounts. Separate from AuthService on purpose — these
 * are different principals with different rules (mandatory MFA, aggressive lockout, short
 * sessions), and entangling them is how "separate ops login" quietly stops being separate.
 */
@Service
@RequiredArgsConstructor
public class OpsAuthService {

    private final OpsUserRepository opsUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuditClient auditClient;

    /** Failed attempts before lockout. Lower than the member policy — these accounts see everyone's data. */
    @Value("${ops.lockout.max-attempts:5}")
    private int maxAttempts;

    @Value("${ops.lockout.minutes:15}")
    private int lockoutMinutes;

    /** Why a login attempt was refused. Never surfaced to the client verbatim — see OpsAuthController. */
    public enum Failure { BAD_CREDENTIALS, INACTIVE, LOCKED }

    /** Outcome of a credential check: either the ops user, or why not. */
    public record AuthResult(OpsUser user, Failure failure) {
        public boolean ok() { return user != null; }
        static AuthResult of(OpsUser u) { return new AuthResult(u, null); }
        static AuthResult fail(Failure f) { return new AuthResult(null, f); }
    }

    /**
     * Verify an ops credential. Does NOT issue a token — MFA still has to pass; see
     * {@link #issueToken(OpsUser)}. Every outcome is audited, because a failed ops login is a
     * security event in a way a failed member login is not.
     */
    public AuthResult authenticate(String email, String password) {
        Optional<OpsUser> found = opsUserRepository.findByEmailIgnoreCase(email == null ? "" : email.trim());
        if (found.isEmpty()) {
            auditClient.record(null, "ops.login.failure", "FAILURE", "email=" + email + " reason=unknown_account");
            return AuthResult.fail(Failure.BAD_CREDENTIALS);
        }
        OpsUser user = found.get();

        if (user.isLocked()) {
            auditClient.record(String.valueOf(user.getId()), "ops.login.denied", "DENIED", "reason=locked");
            return AuthResult.fail(Failure.LOCKED);
        }
        if (Boolean.FALSE.equals(user.getActive())) {
            auditClient.record(String.valueOf(user.getId()), "ops.login.denied", "DENIED", "reason=inactive");
            return AuthResult.fail(Failure.INACTIVE);
        }
        if (!passwordEncoder.matches(password == null ? "" : password, user.getPasswordHash())) {
            registerFailedAttempt(user);
            return AuthResult.fail(Failure.BAD_CREDENTIALS);
        }

        // Correct password: clear the failure counter so a lockout needs consecutive failures.
        if (user.getFailedLoginAttempts() != 0 || user.getLockedUntil() != null) {
            user.setFailedLoginAttempts(0);
            user.setLockedUntil(null);
            opsUserRepository.save(user);
        }
        return AuthResult.of(user);
    }

    /** Count a bad password and lock the account once the threshold is crossed. */
    private void registerFailedAttempt(OpsUser user) {
        int attempts = user.getFailedLoginAttempts() + 1;
        user.setFailedLoginAttempts(attempts);
        if (attempts >= maxAttempts) {
            user.setLockedUntil(LocalDateTime.now().plusMinutes(lockoutMinutes));
            user.setFailedLoginAttempts(0); // reset the counter; the lock is now what gates entry
            auditClient.record(String.valueOf(user.getId()), "ops.login.locked", "DENIED",
                    "reason=too_many_attempts minutes=" + lockoutMinutes);
        } else {
            auditClient.record(String.valueOf(user.getId()), "ops.login.failure", "FAILURE",
                    "reason=bad_password attempt=" + attempts);
        }
        opsUserRepository.save(user);
    }

    /** Final step of ops login: mint the typ=ops token once password AND MFA have passed. */
    public String issueToken(OpsUser user) {
        user.setLastLoginAt(LocalDateTime.now());
        opsUserRepository.save(user);
        auditClient.record(String.valueOf(user.getId()), "ops.login.success", "SUCCESS",
                "roles=" + String.join(",", user.roleNames()));
        return jwtService.generateOpsToken(String.valueOf(user.getId()), user.roleNames());
    }

    public Optional<OpsUser> findById(Long id) {
        return opsUserRepository.findById(id);
    }

    public Optional<OpsUser> findByEmail(String email) {
        return opsUserRepository.findByEmailIgnoreCase(email == null ? "" : email.trim());
    }

    /** Hash a password for a new/updated ops account. */
    public String hash(String rawPassword) {
        return passwordEncoder.encode(rawPassword);
    }
}
