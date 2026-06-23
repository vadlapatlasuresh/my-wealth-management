package com.mywealthmanagement.financialcoreservice.cpa;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * A CPA listed in the marketplace. Each profile is a vetted professional that members can
 * browse, connect with, and (after connecting) review. Mirrors the real-estate "Deal Room"
 * directory pattern but for tax/accounting professionals.
 */
@Entity
@Table(name = "cpa_profile")
@Data
@NoArgsConstructor
public class CpaProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 200)
    private String firm;

    // e.g. "CPA, MST" / "CPA, EA"
    @Column(length = 120)
    private String credentials;

    @Column(name = "license_state", length = 40)
    private String licenseState;

    @Column(name = "license_number", length = 80)
    private String licenseNumber;

    @Column(name = "license_verified", nullable = false)
    private boolean licenseVerified = false;

    // Comma-joined list of specialties (e.g. "SMALL_BUSINESS,REAL_ESTATE"). Exposed as a list
    // via {@link #getSpecialtyList()}.
    @Column(name = "specialties", length = 500)
    private String specialties;

    @Column(length = 200)
    private String location;

    // e.g. "Hourly", "Flat fee", "Retainer".
    @Column(name = "fee_model", length = 80)
    private String feeModel;

    @Column(name = "years_experience")
    private int yearsExperience;

    @Column(length = 2000)
    private String bio;

    @Column(name = "photo_url", length = 500)
    private String photoUrl;

    // Null until at least one review exists.
    @Column(name = "rating_avg", precision = 3, scale = 2)
    private BigDecimal ratingAvg;

    @Column(name = "review_count", nullable = false)
    private int reviewCount = 0;

    // --- Public-facing business links (shown on the profile) ---

    @Column(name = "website_url", length = 500)
    private String websiteUrl;

    // The CPA's Google Business profile / reviews link (e.g. a g.page or maps URL).
    @Column(name = "google_review_url", length = 500)
    private String googleReviewUrl;

    // Self-reported Google rating (0.0–5.0) shown alongside the "See Google reviews" link.
    // Not authoritative — a live Google Places integration can replace this later.
    @Column(name = "google_rating", precision = 2, scale = 1)
    private BigDecimal googleRating;

    // --- Contact details for the listing ---

    @Column(name = "contact_email", length = 200)
    private String contactEmail;

    @Column(length = 40)
    private String phone;

    // --- Moderation: self-registered listings start PENDING and are invisible until an
    // admin approves them. Only APPROVED profiles appear in the public directory. ---

    @Column(name = "status", nullable = false, length = 20)
    private String status = "PENDING";

    @Column(name = "submitted_by_user_id")
    private Long submittedByUserId;

    @Column(name = "submitted_at")
    private LocalDateTime submittedAt;

    /** The comma-joined specialties exposed as a list (empty when none). */
    @Transient
    public List<String> getSpecialtyList() {
        if (specialties == null || specialties.isBlank()) {
            return List.of();
        }
        return Arrays.stream(specialties.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }
}
