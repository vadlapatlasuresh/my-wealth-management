package com.mywealthmanagement.authservice.ops;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.auth.NotificationClient;
import com.mywealthmanagement.authservice.auth.OtpService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Ops staff login — a completely separate front door from /api/v1/auth/**.
 *
 * Two-step, same shape as the member flow so the client code is familiar:
 *   1. POST /api/v1/ops/auth/login   → verifies the password, sends an MFA code
 *   2. POST /api/v1/ops/auth/mfa/verify → exchanges the code for a typ=ops JWT
 *
 * Unlike the member flow, MFA here is NOT switchable off by config. An account that can read
 * every customer's financial data does not get a password-only login because a flag was flipped
 * in a hurry.
 */
@RestController
@RequestMapping("/api/v1/ops/auth")
@RequiredArgsConstructor
public class OpsAuthController {

    private final OpsAuthService opsAuthService;
    private final OtpService otpService;
    private final NotificationClient notificationClient;
    private final AuditClient auditClient;

    /**
     * Dev-only: echo the OTP in the response. Intentionally its OWN flag rather than the member
     * flow's `otp.expose-dev-code` — that one is currently true in production while SendGrid
     * domain auth is pending, and sharing it would hand every ops MFA code straight back to the
     * caller, reducing ops MFA to decoration. Defaults off and must be turned on deliberately.
     */
    @Value("${ops.otp.expose-dev-code:false}")
    private boolean exposeDevCode;

    /** OTP keyspace is namespaced away from the member "mfa:" keys so ids can never collide. */
    private static String otpKey(OpsUser user) {
        return "ops-mfa:" + user.getId();
    }

    /** Step 1: password check → send an MFA code. Never returns a token. */
    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> body) {
        OpsAuthService.AuthResult result =
                opsAuthService.authenticate(body.get("email"), body.get("password"));

        if (!result.ok()) {
            // Deliberately uniform: a wrong password, an unknown address, a deactivated account and
            // a locked one are indistinguishable to the caller. Anything more specific tells an
            // attacker which ops email addresses are real, and ops accounts are a named,
            // enumerable, high-value set. The real reason is in the audit log.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid credentials"));
        }

        OpsUser user = result.user();
        String channel = "SMS".equalsIgnoreCase(user.getMfaChannel()) ? "SMS" : "EMAIL";
        String recipient = "SMS".equals(channel) ? user.getPhone() : user.getEmail();
        String code = otpService.generateFor(otpKey(user));
        notificationClient.sendOtp(channel, recipient, code, "ops-login");

        Map<String, Object> r = new HashMap<>();
        r.put("mfaRequired", true);
        r.put("message", "Verification code sent");
        r.put("email", user.getEmail());
        r.put("channel", channel);
        r.put("destination", "SMS".equals(channel) ? maskPhone(user.getPhone()) : maskEmail(user.getEmail()));
        if (exposeDevCode) r.put("devCode", code);
        return ResponseEntity.ok(r);
    }

    /** Step 2: exchange a valid MFA code for a typ=ops JWT. */
    @PostMapping("/mfa/verify")
    public ResponseEntity<Map<String, Object>> mfaVerify(@RequestBody Map<String, String> body) {
        OpsUser user = opsAuthService.findByEmail(body.get("email")).orElse(null);
        if (user == null || !otpService.verifyFor(otpKey(user), body.get("code"))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid or expired code"));
        }
        // Re-check state at the moment of issue: an admin may have deactivated or locked this
        // account in the seconds between step 1 and step 2.
        if (Boolean.FALSE.equals(user.getActive()) || user.isLocked()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid credentials"));
        }

        Map<String, Object> r = new HashMap<>();
        r.put("token", opsAuthService.issueToken(user));
        r.put("message", "Login successful");
        r.putAll(profileOf(user));
        r.put("permissions", opsAuthService.permissionsOf(user));
        return ResponseEntity.ok(r);
    }

    /**
     * The signed-in ops user, including their effective permissions so the portal can hide what
     * they cannot do. Client-side gating only — every endpoint re-checks with @PreAuthorize.
     * Requires a typ=ops token; a member token cannot reach this route.
     */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me() {
        return opsAuthService.findById(currentOpsUserId())
                .map(u -> {
                    Map<String, Object> m = new HashMap<>(profileOf(u));
                    m.put("permissions", opsAuthService.permissionsOf(u));
                    return ResponseEntity.ok(m);
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    /**
     * The signed-in agent's own audited activity — "what I did, step by step".
     *
     * Deliberately not the /support/users/{id}/activity route the portal used to call: that one
     * resolves a CUSTOMER id, and an ops user is not a customer, so it would 404 on every ops id.
     * The subject on an ops token is an ops_users id and only means anything here.
     */
    @GetMapping("/me/activity")
    public List<Map<String, Object>> myActivity(@RequestParam(defaultValue = "50") int limit) {
        int capped = Math.min(Math.max(limit, 1), 200);
        return auditClient.fetchUserActivity(String.valueOf(currentOpsUserId()), false, capped);
    }

    /** The ops_users id from the typ=ops token's subject. */
    private static Long currentOpsUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    private static Map<String, Object> profileOf(OpsUser u) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", u.getId());
        m.put("email", u.getEmail());
        m.put("name", u.getName());
        m.put("roles", u.roleNames());
        m.put("lastLoginAt", u.getLastLoginAt());
        return m;
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "your email";
        int at = email.indexOf('@');
        return email.charAt(0) + "•••" + email.substring(at);
    }

    private static String maskPhone(String phone) {
        if (phone == null || phone.length() < 4) return "your phone";
        return "•••-•••-" + phone.substring(phone.length() - 4);
    }
}
