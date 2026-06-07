package com.mywealthmanagement.authservice.auth;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.auth.dto.LoginRequest;
import com.mywealthmanagement.authservice.auth.dto.RegisterRequest;
import com.mywealthmanagement.authservice.user.Role;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

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

        // Persist ONLY the last 4 digits of any SSN/EIN provided.
        newUser.setSsnLast4(last4(request.getSsn()));
        newUser.setEinLast4(last4(request.getEin()));

        newUser.setPhoneVerified(Boolean.TRUE.equals(request.getPhoneVerified()));

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

    public Optional<User> findByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    /** Permanently remove a user's identity. Idempotent: a missing id is a no-op. */
    public void deleteUser(Long userId) {
        userRepository.deleteById(userId);
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
