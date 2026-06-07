package com.mywealthmanagement.authservice.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor; // Added
import lombok.Data;
import lombok.NoArgsConstructor; // Keep this for other use cases

@Data
@NoArgsConstructor
@AllArgsConstructor // Added
public class RegisterRequest {
    @NotBlank(message = "Email cannot be blank")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "Password cannot be blank")
    @Size(min = 8, message = "Password must be at least 8 characters long")
    private String password;

    // Optional display name captured at signup (derived from first/last if absent).
    private String name;

    // Richer profile fields (all optional for backward compatibility).
    private String firstName;
    private String lastName;
    private String phone;
    private String accountType;   // INDIVIDUAL | BUSINESS
    private String businessName;  // required for BUSINESS accounts (validated client-side)

    // Sensitive identifiers — only the last 4 digits are persisted server-side.
    private String ssn;
    private String ein;

    // Whether the phone was verified via SMS OTP before submitting.
    private Boolean phoneVerified;
}
