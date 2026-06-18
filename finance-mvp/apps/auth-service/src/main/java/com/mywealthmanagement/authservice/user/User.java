package com.mywealthmanagement.authservice.user;

import com.mywealthmanagement.authservice.security.EncryptedStringConverter;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Set;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(name = "name")
    private String name;

    @Column(name = "first_name")
    private String firstName;

    @Column(name = "last_name")
    private String lastName;

    @Column(name = "phone")
    private String phone;

    @Column(name = "account_type")
    private String accountType; // INDIVIDUAL | BUSINESS

    @Column(name = "business_name")
    private String businessName;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    // --- Address ---
    @Column(name = "address_line1")
    private String addressLine1;

    @Column(name = "address_line2")
    private String addressLine2;

    @Column(name = "city")
    private String city;

    @Column(name = "state")
    private String state;

    @Column(name = "postal_code")
    private String postalCode;

    @Column(name = "country")
    private String country;

    // Full SSN/EIN encrypted at rest (AES-256-GCM); UI only ever shows the last 4.
    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "ssn_encrypted")
    private String ssnEncrypted;

    @Column(name = "ssn_last4", length = 4)
    private String ssnLast4;

    @Convert(converter = EncryptedStringConverter.class)
    @Column(name = "ein_encrypted")
    private String einEncrypted;

    @Column(name = "ein_last4", length = 4)
    private String einLast4;

    @Column(name = "phone_verified")
    private Boolean phoneVerified = false;

    @Column(name = "email_verified")
    private Boolean emailVerified = false;

    // Preferred MFA delivery channel: EMAIL | SMS
    @Column(name = "mfa_channel", length = 10)
    private String mfaChannel = "EMAIL";

    @Column(name = "identity_verified")
    private Boolean identityVerified = false;

    // Client idle-logout window in minutes (default 5, max 30). Enforced in the web/app.
    @Column(name = "session_timeout_minutes")
    private Integer sessionTimeoutMinutes = 5;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @ElementCollection(targetClass = Role.class, fetch = FetchType.EAGER)
    @CollectionTable(name = "user_roles", joinColumns = @JoinColumn(name = "user_id"))
    @Enumerated(EnumType.STRING)
    private Set<Role> roles;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public User(String email, String passwordHash, Set<Role> roles) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.roles = roles;
    }
}
