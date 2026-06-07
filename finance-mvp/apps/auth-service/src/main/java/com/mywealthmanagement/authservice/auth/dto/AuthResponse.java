package com.mywealthmanagement.authservice.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class AuthResponse {
    private String token;
    private String message;
    private String email;
    private String name;

    // Convenience for error responses (no user info).
    public AuthResponse(String token, String message) {
        this.token = token;
        this.message = message;
    }
}
