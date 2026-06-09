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

    // Sensitive identifiers — stored encrypted (AES-256-GCM); only last-4 ever shown.
    private String ssn;
    private String ein;

    // KYC / contact details.
    private String dateOfBirth;   // ISO yyyy-MM-dd
    private String addressLine1;
    private String addressLine2;
    private String city;
    private String state;
    private String postalCode;
    private String country;

    // Preferred MFA channel for future logins: EMAIL | SMS.
    private String mfaChannel;

    // Whether phone/email were verified via OTP before submitting.
    private Boolean phoneVerified;
    private Boolean emailVerified;
}
