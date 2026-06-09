package com.mywealthmanagement.authservice.auth.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class AuthResponse {
    private String token;
    private String message;
    private String email;
    private String name;

    // --- MFA step-up (returned by /login when a code is required) ---
    private Boolean mfaRequired;
    private String channel;      // EMAIL | SMS
    private String destination;  // masked target, e.g. "d•••@gmail.com" or "•••-•••-1234"
    private String devCode;      // dev-only convenience (no real provider keys); omit in prod

    public AuthResponse(String token, String message) {
        this.token = token;
        this.message = message;
    }

    public AuthResponse(String token, String message, String email, String name) {
        this.token = token;
        this.message = message;
        this.email = email;
        this.name = name;
    }
}
