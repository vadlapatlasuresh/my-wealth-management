package com.mywealthmanagement.authservice.auth;

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

        return Optional.of(userRepository.save(newUser));
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

    public String loginUser(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
        );
        if (authentication.isAuthenticated()) {
            User user = userRepository.findByEmail(request.getEmail())
                    .orElseThrow(() -> new RuntimeException("User not found"));
            return jwtService.generateToken(String.valueOf(user.getId()));
        }
        throw new RuntimeException("Invalid credentials"); // Should be caught by AuthenticationManager
    }
}
