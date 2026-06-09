package com.mywealthmanagement.authservice.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Full profile for the signed-in user. SSN/EIN are returned masked (last-4 only) — never the full value. */
@Data
@AllArgsConstructor
@NoArgsConstructor
public class ProfileResponse {
    private Long id;
    private String email;
    private String name;
    private String firstName;
    private String lastName;
    private String phone;
    private String accountType;
    private String businessName;
    private String dateOfBirth;     // ISO yyyy-MM-dd
    private String addressLine1;
    private String addressLine2;
    private String city;
    private String state;
    private String postalCode;
    private String country;
    private String ssnMasked;       // e.g. "•••-••-1234"
    private String einMasked;       // e.g. "••-•••1234"
    private Boolean phoneVerified;
    private Boolean emailVerified;
    private Boolean identityVerified;
    private String mfaChannel;      // EMAIL | SMS
}
