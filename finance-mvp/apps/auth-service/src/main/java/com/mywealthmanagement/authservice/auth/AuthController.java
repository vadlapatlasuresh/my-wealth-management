package com.mywealthmanagement.authservice.auth;

import com.mywealthmanagement.authservice.auth.dto.AuthResponse;
import com.mywealthmanagement.authservice.auth.dto.LoginRequest;
import com.mywealthmanagement.authservice.auth.dto.ProfileResponse;
import com.mywealthmanagement.authservice.auth.dto.RegisterRequest;
import com.mywealthmanagement.authservice.auth.dto.UpdateProfileRequest;
import com.mywealthmanagement.authservice.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;
    private final OtpService otpService;
    private final NotificationClient notificationClient;
    private final ExportClient exportClient;

    @Value("${mfa.enabled:true}")
    private boolean mfaEnabled;

    // Dev convenience: also return the OTP in the API response. MUST be false in prod
    // (real codes are delivered via notification-service).
    @Value("${otp.expose-dev-code:true}")
    private boolean exposeDevCode;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        Optional<User> registeredUser = authService.registerUser(request);
        if (registeredUser.isPresent()) {
            // Sign-up logs the new user straight in (registration is not a "login").
            String token = authService.loginUser(new LoginRequest(request.getEmail(), request.getPassword()));
            User u = registeredUser.get();
            return ResponseEntity.ok(new AuthResponse(token, "User registered successfully", u.getEmail(), u.getName()));
        }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new AuthResponse(null, "User with this email already exists"));
    }

    /**
     * Step 1 of login: verify the password. With MFA enabled (default), this does NOT
     * return a token — it sends a one-time code via the user's chosen channel and asks
     * the client to call /mfa/verify. In dev the code is also returned as devCode.
     */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        User user;
        try {
            user = authService.authenticate(request);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new AuthResponse(null, "Invalid credentials"));
        }
        if (!mfaEnabled) {
            String token = authService.issueToken(user);
            return ResponseEntity.ok(new AuthResponse(token, "Login successful", user.getEmail(), user.getName()));
        }
        String channel = AuthService.normalizeChannel(user.getMfaChannel());
        String code = otpService.generateFor("mfa:" + user.getId());
        // Deliver via notification-service (mock in dev, Twilio/SendGrid when keyed).
        String recipient = "SMS".equals(channel) ? user.getPhone() : user.getEmail();
        notificationClient.sendOtp(channel, recipient, code, "login");
        AuthResponse r = new AuthResponse(null, "Verification code sent");
        r.setMfaRequired(true);
        r.setEmail(user.getEmail());
        r.setChannel(channel);
        r.setDestination("SMS".equals(channel) ? maskPhone(user.getPhone()) : maskEmail(user.getEmail()));
        if (exposeDevCode) r.setDevCode(code);
        return ResponseEntity.ok(r);
    }

    /** Step 2 of login: exchange a valid MFA code for a JWT. */
    @PostMapping("/mfa/verify")
    public ResponseEntity<AuthResponse> mfaVerify(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String code = body.get("code");
        User user = authService.findByEmail(email).orElse(null);
        if (user == null || !otpService.verifyFor("mfa:" + user.getId(), code)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new AuthResponse(null, "Invalid or expired code"));
        }
        String token = authService.issueToken(user);
        return ResponseEntity.ok(new AuthResponse(token, "Login successful", user.getEmail(), user.getName()));
    }

    /** Send an email-verification code (signup or profile). Dev returns the code. */
    @PostMapping("/email/send")
    public ResponseEntity<Map<String, Object>> emailSend(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || !email.contains("@")) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("sent", false, "message", "Enter a valid email"));
        }
        String code = otpService.generateFor("email:" + email);
        notificationClient.sendOtp("EMAIL", email, code, "email-verify");
        Map<String, Object> resp = new java.util.HashMap<>();
        resp.put("sent", true);
        resp.put("message", "Verification code sent");
        if (exposeDevCode) resp.put("devCode", code);
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/email/verify")
    public ResponseEntity<Map<String, Object>> emailVerify(@RequestBody Map<String, String> body) {
        boolean ok = otpService.verifyFor("email:" + body.get("email"), body.get("code"));
        if (ok) authService.markEmailVerified(body.get("email"));
        return ResponseEntity.ok(Map.of("verified", ok));
    }

    /** Step 1 of password reset: email a one-time code. Always 200 (no account enumeration). */
    @PostMapping("/password/forgot")
    public ResponseEntity<Map<String, Object>> forgotPassword(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email != null && email.contains("@")) {
            authService.findByEmail(email).ifPresent(u -> {
                String code = otpService.generateFor("pwreset:" + email.toLowerCase());
                notificationClient.sendOtp("EMAIL", email, code, "password-reset");
            });
        }
        return ResponseEntity.ok(Map.of("sent", true,
                "message", "If that email is registered, a reset code has been sent."));
    }

    /** Step 2 of password reset: verify the code and set a new password. */
    @PostMapping("/password/reset")
    public ResponseEntity<Map<String, Object>> resetPassword(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        String code = body.get("code");
        String newPassword = body.get("newPassword");
        if (email == null || code == null || newPassword == null || newPassword.length() < 8) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("reset", false,
                    "message", "Provide a valid email, code, and a password of at least 8 characters."));
        }
        if (!otpService.verifyFor("pwreset:" + email.toLowerCase(), code)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("reset", false,
                    "message", "That code is invalid or has expired."));
        }
        boolean ok = authService.updatePassword(email, newPassword);
        return ok
                ? ResponseEntity.ok(Map.of("reset", true, "message", "Password updated — you can now sign in."))
                : ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("reset", false,
                        "message", "Could not reset the password. Please try again."));
    }

    /** Full profile for the signed-in user (SSN/EIN masked). */
    @GetMapping("/me")
    public ResponseEntity<ProfileResponse> me() {
        Long userId = currentUserId();
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(authService.getProfile(userId));
    }

    /** GDPR data export (right-to-access): the signed-in user's data across services as JSON. */
    @GetMapping("/me/export")
    public ResponseEntity<Map<String, Object>> exportMyData() {
        Long userId = currentUserId();
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        Map<String, Object> export = new java.util.LinkedHashMap<>();
        export.put("profile", authService.getProfile(userId));
        export.putAll(exportClient.exportUser(userId));
        return ResponseEntity.ok()
                .header("Content-Disposition", "attachment; filename=\"terravest-data-export.json\"")
                .body(export);
    }

    /** Update editable profile fields. */
    @PutMapping("/me")
    public ResponseEntity<ProfileResponse> updateMe(@RequestBody UpdateProfileRequest request) {
        Long userId = currentUserId();
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(authService.updateProfile(userId, request));
    }

    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteMyAccount() {
        Long userId = currentUserId();
        if (userId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        authService.deleteUser(userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/validate")
    public ResponseEntity<String> validateToken(@RequestParam String token) {
        if (token != null && !token.isBlank() && jwtService.isTokenValid(token)) {
            return ResponseEntity.ok("Token is valid");
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Token is invalid or missing");
    }

    // --- helpers ---
    private static Long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())) return null;
        try { return Long.parseLong(auth.getName()); } catch (NumberFormatException e) { return null; }
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "•••";
        String[] parts = email.split("@", 2);
        String shown = parts[0].isEmpty() ? "" : parts[0].substring(0, 1);
        return shown + "•••@" + parts[1];
    }

    private static String maskPhone(String phone) {
        if (phone == null) return "•••";
        String d = phone.replaceAll("\\D", "");
        return d.length() >= 4 ? "•••-•••-" + d.substring(d.length() - 4) : "•••";
    }
}
