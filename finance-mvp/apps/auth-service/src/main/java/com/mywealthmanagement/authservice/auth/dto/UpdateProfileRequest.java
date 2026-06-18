package com.mywealthmanagement.authservice.auth.dto;

import lombok.Data;

/** Editable profile fields. Email, SSN/EIN and password are NOT updatable here. */
@Data
public class UpdateProfileRequest {
    private String name;
    private String firstName;
    private String lastName;
    private String phone;
    private String dateOfBirth;   // ISO yyyy-MM-dd
    private String addressLine1;
    private String addressLine2;
    private String city;
    private String state;
    private String postalCode;
    private String country;
    private String mfaChannel;    // EMAIL | SMS
    private Integer sessionTimeoutMinutes; // client idle-logout window; clamped 5..30
}
