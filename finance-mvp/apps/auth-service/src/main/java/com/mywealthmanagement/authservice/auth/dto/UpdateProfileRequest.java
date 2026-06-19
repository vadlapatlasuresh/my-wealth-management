package com.mywealthmanagement.authservice.auth.dto;

import lombok.Data;

/** Editable profile fields. Email and password are NOT updatable here. SSN is
 *  write-once: it may be supplied to set it the FIRST time (progressive KYC) but
 *  is ignored once one is already on file — it can never be changed or read back. */
@Data
public class UpdateProfileRequest {
    private String name;
    private String firstName;
    private String lastName;
    private String phone;
    private String ssn;           // write-once: honored only when none is on file yet
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
