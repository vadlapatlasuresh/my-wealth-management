package com.mywealthmanagement.authservice.auth;

import com.mywealthmanagement.authservice.auth.dto.AuthResponse;
import com.mywealthmanagement.authservice.auth.dto.LoginRequest;
import com.mywealthmanagement.authservice.auth.dto.RegisterRequest;
import com.mywealthmanagement.authservice.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        Optional<User> registeredUser = authService.registerUser(request);
        if (registeredUser.isPresent()) {
            String token = authService.loginUser(new LoginRequest(request.getEmail(), request.getPassword()));
            User u = registeredUser.get();
            return ResponseEntity.ok(new AuthResponse(token, "User registered successfully", u.getEmail(), u.getName()));
        }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new AuthResponse(null, "User with this email already exists"));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        try {
            String token = authService.loginUser(request);
            String email = request.getEmail();
            String name = authService.findByEmail(email).map(User::getName).orElse(null);
            return ResponseEntity.ok(new AuthResponse(token, "Login successful", email, name));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new AuthResponse(null, "Invalid credentials"));
        }
    }

    /**
     * Permanently delete the signed-in user's account (their identity / credentials).
     * The JWT subject is the userId; once removed the user can no longer log in.
     * Protected by an explicit authenticated() matcher in SecurityConfig.
     */
    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteMyAccount() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null || "anonymousUser".equals(auth.getName())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            authService.deleteUser(Long.parseLong(auth.getName()));
        } catch (NumberFormatException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/validate")
    public ResponseEntity<String> validateToken(@RequestParam String token) {
        // Cryptographically verify the token's signature and expiry — do NOT trust mere presence.
        if (token != null && !token.isBlank() && jwtService.isTokenValid(token)) {
            return ResponseEntity.ok("Token is valid");
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Token is invalid or missing");
    }
}
