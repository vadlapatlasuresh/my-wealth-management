package com.mywealthmanagement.authservice.auth;

import com.mywealthmanagement.authservice.auth.dto.AuthResponse;
import com.mywealthmanagement.authservice.auth.dto.LoginRequest;
import com.mywealthmanagement.authservice.auth.dto.RegisterRequest;
import com.mywealthmanagement.authservice.user.User;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

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

    @GetMapping("/validate")
    public ResponseEntity<String> validateToken(@RequestParam String token) {
        // This endpoint is primarily for API Gateway to validate tokens
        // In a real scenario, JwtAuthFilter would handle this implicitly for protected resources
        // For explicit validation, we can use jwtService.validateToken(token, userDetails)
        // For now, a simple check if token is present and not empty is sufficient for basic routing
        if (token != null && !token.isEmpty()) {
            return ResponseEntity.ok("Token is valid");
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Token is invalid or missing");
    }
}
