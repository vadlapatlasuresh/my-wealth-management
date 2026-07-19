package com.mywealthmanagement.authservice.auth;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.auth.dto.LoginRequest;
import com.mywealthmanagement.authservice.auth.dto.ProfileResponse;
import com.mywealthmanagement.authservice.auth.dto.RegisterRequest;
import com.mywealthmanagement.authservice.auth.dto.UpdateProfileRequest;
import com.mywealthmanagement.authservice.user.Role;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final AuditClient auditClient;
    private final UserDataPurgeClient userDataPurgeClient;

    public Optional<User> registerUser(RegisterRequest request) {
        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            return Optional.empty(); // User already exists
        }

        User newUser = new User(
                request.getEmail(),
                passwordEncoder.encode(request.getPassword()),
                Collections.singleton(Role.USER) // Default role
        );

        // Display name: explicit name, else first+last, else email prefix.
        String fullName = request.getName();
        if (isBlank(fullName)) {
            fullName = (safe(request.getFirstName()) + " " + safe(request.getLastName())).trim();
        }
        if (isBlank(fullName)) {
            fullName = request.getEmail().split("@")[0];
        }
        newUser.setName(fullName);
        newUser.setFirstName(request.getFirstName());
        newUser.setLastName(request.getLastName());
        newUser.setPhone(request.getPhone());

        String accountType = isBlank(request.getAccountType()) ? "INDIVIDUAL"
                : request.getAccountType().toUpperCase();
        newUser.setAccountType(accountType);
        newUser.setBusinessName(request.getBusinessName());

        // Store the FULL SSN/EIN encrypted at rest (AES-256-GCM) + the last 4 for display.
        if (!isBlank(request.getSsn())) {
            newUser.setSsnEncrypted(request.getSsn().replaceAll("\\D", ""));
            newUser.setSsnLast4(last4(request.getSsn()));
        }
        if (!isBlank(request.getEin())) {
            newUser.setEinEncrypted(request.getEin().replaceAll("\\D", ""));
            newUser.setEinLast4(last4(request.getEin()));
        }

        // KYC / contact details.
        newUser.setDateOfBirth(parseDate(request.getDateOfBirth()));
        newUser.setAddressLine1(request.getAddressLine1());
        newUser.setAddressLine2(request.getAddressLine2());
        newUser.setCity(request.getCity());
        newUser.setState(request.getState());
        newUser.setPostalCode(request.getPostalCode());
        newUser.setCountry(request.getCountry());
        newUser.setMfaChannel(normalizeChannel(request.getMfaChannel()));

        newUser.setPhoneVerified(Boolean.TRUE.equals(request.getPhoneVerified()));
        newUser.setEmailVerified(Boolean.TRUE.equals(request.getEmailVerified()));

        // Mock identity verification: pass if the relevant identifier was supplied.
        boolean idVerified = "BUSINESS".equals(accountType)
                ? newUser.getEinLast4() != null
                : newUser.getSsnLast4() != null;
        newUser.setIdentityVerified(idVerified);

        User saved = userRepository.save(newUser);
        auditClient.record(String.valueOf(saved.getId()), "auth.register.success", "SUCCESS", null);
        return Optional.of(saved);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String safe(String s) {
        return s == null ? "" : s.trim();
    }

    /** Returns the last 4 digits of a numeric identifier, or null if none. */
    private static String last4(String raw) {
        if (raw == null) return null;
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() < 4) return null;
        return digits.substring(digits.length() - 4);
    }

    private static java.time.LocalDate parseDate(String iso) {
        if (isBlank(iso)) return null;
        try { return java.time.LocalDate.parse(iso.trim()); } catch (Exception e) { return null; }
    }

    static String normalizeChannel(String c) {
        return "SMS".equalsIgnoreCase(c) ? "SMS" : "EMAIL";
    }

    /**
     * Validate credentials WITHOUT issuing a token (step 1 of MFA login). Returns the
     * user on success; throws on bad credentials (recorded as a failed attempt).
     */
    public User authenticate(LoginRequest request) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));
        } catch (RuntimeException ex) {
            auditClient.record(null, "auth.login.failure", "FAILURE", "email=" + request.getEmail());
            throw ex;
        }
        return userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    /** Issue a JWT for an already-authenticated user (step 2 of MFA login). */
    public String issueToken(User user) {
        auditClient.record(String.valueOf(user.getId()), "auth.login.success", "SUCCESS", "mfa");
        return jwtService.generateToken(String.valueOf(user.getId()), roleNames(user));
    }

    /**
     * Find an existing user by email, or provision one for a verified social
     * (Google/Apple) sign-in. Federated accounts have no usable password — a random
     * one is stored so the local-login path can never authenticate them. The email
     * is trusted as verified because the provider already verified it.
     */
    public User findOrCreateOAuthUser(String email, String name, String provider) {
        return userRepository.findByEmail(email)
                .map(existing -> linkOAuthProvider(existing, provider))
                .orElseGet(() -> {
                    User u = new User(
                            email,
                            passwordEncoder.encode("oauth:" + java.util.UUID.randomUUID()),
                            Collections.singleton(Role.USER));
                    u.setName(isBlank(name) ? email.split("@")[0] : name);
                    u.setAccountType("INDIVIDUAL");
                    u.setEmailVerified(true);
                    u.setAuthProvider(provider);
                    if ("google".equals(provider)) u.setGoogleLinkedAt(LocalDateTime.now());
                    User saved = userRepository.save(u);
                    auditClient.record(String.valueOf(saved.getId()), "auth.oauth.register", "SUCCESS", provider);
                    return saved;
                });
    }

    /**
     * An existing account just authenticated through a social provider. Records the link the
     * first time it happens.
     *
     * Deliberately does NOT overwrite auth_provider: someone who registered with a password and
     * later clicks "Sign in with Google" can still use that password, so claiming the account is
     * now a Google account would be false. Stamping google_linked_at instead keeps both facts.
     *
     * This is safe as an implicit link only because the provider verified the email before we
     * ever see it — see GoogleTokenVerifier. It must never be reached with an unverified address.
     */
    private User linkOAuthProvider(User user, String provider) {
        if (!"google".equals(provider) || user.getGoogleLinkedAt() != null) return user;
        user.setGoogleLinkedAt(LocalDateTime.now());
        User saved = userRepository.save(user);
        auditClient.record(String.valueOf(saved.getId()), "auth.oauth.link", "SUCCESS", provider);
        return saved;
    }

    /** Mark a user's email as verified (after an email OTP succeeds). */
    public void markEmailVerified(String email) {
        userRepository.findByEmail(email).ifPresent(u -> {
            u.setEmailVerified(true);
            userRepository.save(u);
        });
    }

    public java.util.Optional<User> findById(Long id) {
        return userRepository.findById(id);
    }

    public ProfileResponse getProfile(Long userId) {
        return toProfile(userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found")));
    }

    public ProfileResponse updateProfile(Long userId, UpdateProfileRequest r) {
        User u = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!isBlank(r.getName())) u.setName(r.getName());
        if (r.getFirstName() != null) u.setFirstName(r.getFirstName());
        if (r.getLastName() != null) u.setLastName(r.getLastName());
        if (r.getPhone() != null) u.setPhone(r.getPhone());
        // SSN is write-once (progressive KYC): set it only when none is on file yet,
        // and only when it looks like a 9-digit value. An already-set SSN is never
        // overwritten here. Stored encrypted at rest; only the last 4 are shown.
        if (!isBlank(r.getSsn()) && u.getSsnLast4() == null) {
            String digits = r.getSsn().replaceAll("\\D", "");
            if (digits.length() == 9) {
                u.setSsnEncrypted(digits);
                u.setSsnLast4(last4(digits));
            }
        }
        if (r.getDateOfBirth() != null) u.setDateOfBirth(parseDate(r.getDateOfBirth()));
        if (r.getAddressLine1() != null) u.setAddressLine1(r.getAddressLine1());
        if (r.getAddressLine2() != null) u.setAddressLine2(r.getAddressLine2());
        if (r.getCity() != null) u.setCity(r.getCity());
        if (r.getState() != null) u.setState(r.getState());
        if (r.getPostalCode() != null) u.setPostalCode(r.getPostalCode());
        if (r.getCountry() != null) u.setCountry(r.getCountry());
        if (!isBlank(r.getMfaChannel())) u.setMfaChannel(normalizeChannel(r.getMfaChannel()));
        if (r.getSessionTimeoutMinutes() != null) {
            // Clamp to the allowed 5..30 minute window.
            u.setSessionTimeoutMinutes(Math.max(5, Math.min(30, r.getSessionTimeoutMinutes())));
        }
        // Progressive KYC: once the core identity fields are all on file, flag the
        // profile as identity-collected. (Never un-sets a previously-verified flag.)
        if (Boolean.TRUE.equals(u.getIdentityVerified()) == false
                && u.getSsnLast4() != null
                && u.getDateOfBirth() != null
                && !isBlank(u.getAddressLine1())
                && !isBlank(u.getPostalCode())) {
            u.setIdentityVerified(true);
        }
        return toProfile(userRepository.save(u));
    }

    private static ProfileResponse toProfile(User u) {
        ProfileResponse p = new ProfileResponse();
        p.setId(u.getId());
        p.setEmail(u.getEmail());
        p.setName(u.getName());
        p.setFirstName(u.getFirstName());
        p.setLastName(u.getLastName());
        p.setPhone(u.getPhone());
        p.setAccountType(u.getAccountType());
        p.setBusinessName(u.getBusinessName());
        p.setDateOfBirth(u.getDateOfBirth() != null ? u.getDateOfBirth().toString() : null);
        p.setAddressLine1(u.getAddressLine1());
        p.setAddressLine2(u.getAddressLine2());
        p.setCity(u.getCity());
        p.setState(u.getState());
        p.setPostalCode(u.getPostalCode());
        p.setCountry(u.getCountry());
        p.setSsnMasked(u.getSsnLast4() != null ? "•••-••-" + u.getSsnLast4() : null);
        p.setEinMasked(u.getEinLast4() != null ? "••-•••" + u.getEinLast4() : null);
        p.setPhoneVerified(u.getPhoneVerified());
        p.setEmailVerified(u.getEmailVerified());
        p.setIdentityVerified(u.getIdentityVerified());
        p.setMfaChannel(u.getMfaChannel());
        p.setSessionTimeoutMinutes(u.getSessionTimeoutMinutes() != null ? u.getSessionTimeoutMinutes() : 5);
        return p;
    }

    public Optional<User> findByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    /** Set a new password (forgot-password flow, after the emailed code is verified). */
    public boolean updatePassword(String email, String newPassword) {
        return userRepository.findByEmail(email).map(u -> {
            u.setPasswordHash(passwordEncoder.encode(newPassword));
            userRepository.save(u);
            auditClient.record(String.valueOf(u.getId()), "auth.password.reset", "SUCCESS", null);
            return true;
        }).orElse(false);
    }

    /** Outcome of an authenticated password change. */
    public enum ChangeResult { OK, WRONG_CURRENT, SAME_AS_OLD, NOT_FOUND }

    /**
     * Change the signed-in user's password: verify the current password, reject a no-op
     * re-use of the same password, then store the new hash. Policy (length/complexity) is
     * enforced by the controller via {@link PasswordPolicy} before this is called.
     */
    public ChangeResult changePassword(Long userId, String currentPassword, String newPassword) {
        return userRepository.findById(userId).map(u -> {
            if (currentPassword == null || !passwordEncoder.matches(currentPassword, u.getPasswordHash())) {
                auditClient.record(String.valueOf(u.getId()), "auth.password.change", "FAILURE", "wrong current password");
                return ChangeResult.WRONG_CURRENT;
            }
            if (passwordEncoder.matches(newPassword, u.getPasswordHash())) {
                return ChangeResult.SAME_AS_OLD;
            }
            u.setPasswordHash(passwordEncoder.encode(newPassword));
            userRepository.save(u);
            auditClient.record(String.valueOf(u.getId()), "auth.password.change", "SUCCESS", null);
            return ChangeResult.OK;
        }).orElse(ChangeResult.NOT_FOUND);
    }

    /**
     * Permanently remove a user: first purge all downstream financial data across
     * services (best-effort), then delete the identity. Idempotent. Audit logs are
     * retained for compliance.
     */
    public void deleteUser(Long userId) {
        userDataPurgeClient.purgeUser(userId);
        userRepository.deleteById(userId);
        auditClient.record(String.valueOf(userId), "account.delete", "SUCCESS", "user-initiated");
    }

    /** Role names (e.g. ["USER","CARE"]) for the JWT roles claim. */
    private static java.util.List<String> roleNames(User user) {
        if (user.getRoles() == null) return java.util.List.of();
        return user.getRoles().stream().map(Enum::name).toList();
    }

    public String loginUser(LoginRequest request) {
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
            );
        } catch (RuntimeException ex) {
            // Bad credentials / disabled / locked etc. — record the failed attempt (no userId).
            auditClient.record(null, "auth.login.failure", "FAILURE", "email=" + request.getEmail());
            throw ex;
        }
        if (authentication.isAuthenticated()) {
            User user = userRepository.findByEmail(request.getEmail())
                    .orElseThrow(() -> new RuntimeException("User not found"));
            auditClient.record(String.valueOf(user.getId()), "auth.login.success", "SUCCESS", null);
            return jwtService.generateToken(String.valueOf(user.getId()), roleNames(user));
        }
        auditClient.record(null, "auth.login.failure", "FAILURE", "email=" + request.getEmail());
        throw new RuntimeException("Invalid credentials"); // Should be caught by AuthenticationManager
    }
}
