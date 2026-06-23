package com.mywealthmanagement.financialcoreservice.cpa;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
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
