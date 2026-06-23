package com.mywealthmanagement.financialcoreservice.cpa;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

/**
 * Seeds a handful of realistic, verified sample CPAs so the marketplace isn't empty on a
 * fresh install. Guarded: runs only when {@code cpa_profile} is empty. Mirrors the Deal
 * Room's sample-data seeding.
 */
@Component
@RequiredArgsConstructor
public class CpaSeeder implements CommandLineRunner {

    private final CpaProfileRepository profileRepository;

    @Override
    public void run(String... args) {
        if (profileRepository.count() > 0) {
            return; // already seeded
        }

        profileRepository.save(cpa(
                "Maria Gonzalez", "Gonzalez & Co. CPAs", "CPA, MST", "TX", "TX-104882",
                "SMALL_BUSINESS,SELF_EMPLOYED", "Austin, TX", "Flat fee", 14,
                "Boutique practice focused on S-corp and LLC owners. I help self-employed clients "
                        + "structure entities, run payroll, and minimize SE tax.",
                "4.80", 27));

        profileRepository.save(cpa(
                "David Chen", "Chen Tax Advisory", "CPA", "CA", "CA-88231",
                "REAL_ESTATE,SMALL_BUSINESS", "San Diego, CA", "Hourly", 11,
                "Real estate investor specialist: cost segregation, 1031 exchanges, depreciation, "
                        + "and short-term rental tax strategy.",
                "4.60", 41));

        profileRepository.save(cpa(
                "Priya Nair", "Borderless Tax LLC", "CPA, EA", "NY", "NY-220194",
                "EXPAT_INTERNATIONAL,SELF_EMPLOYED", "New York, NY", "Retainer", 9,
                "Cross-border and expat tax: FBAR, FATCA, foreign earned income exclusion, and "
                        + "treaty positions for US citizens abroad.",
                "4.90", 18));

        profileRepository.save(cpa(
                "James Whitfield", "Whitfield Digital CPA", "CPA", "WA", "WA-55410",
                "CRYPTO,SMALL_BUSINESS", "Seattle, WA", "Flat fee", 7,
                "Crypto and digital-asset accounting: cost-basis reconciliation, staking/DeFi "
                        + "income, and clean reporting for traders and founders.",
                "4.40", 33));

        profileRepository.save(cpa(
                "Sarah Olsen", "Olsen Advisory Group", "CPA, CFP", "CO", "CO-91200",
                "SELF_EMPLOYED,REAL_ESTATE,SMALL_BUSINESS", "Denver, CO", "Hourly", 18,
                "Full-service planning for freelancers and landlords: quarterly estimates, "
                        + "retirement plan setup, and year-round tax projections.",
                "4.70", 52));
    }

    private CpaProfile cpa(String name, String firm, String credentials, String licenseState,
                           String licenseNumber, String specialties, String location, String feeModel,
                           int yearsExperience, String bio, String ratingAvg, int reviewCount) {
        CpaProfile c = new CpaProfile();
        c.setName(name);
        c.setFirm(firm);
        c.setCredentials(credentials);
        c.setLicenseState(licenseState);
        c.setLicenseNumber(licenseNumber);
        c.setLicenseVerified(true);
        c.setVerificationSource("MANUAL");
        c.setLicenseVerifiedAt(java.time.LocalDateTime.now());
        c.setSpecialties(specialties);
        c.setLocation(location);
        c.setFeeModel(feeModel);
        c.setYearsExperience(yearsExperience);
        c.setBio(bio);
        c.setRatingAvg(new BigDecimal(ratingAvg));
        c.setReviewCount(reviewCount);
        // Seeded CPAs are pre-vetted: live in the directory, with sample business links.
        c.setStatus("APPROVED");
        String slug = firm.toLowerCase().replaceAll("[^a-z0-9]+", "");
        c.setWebsiteUrl("https://www." + slug + ".com");
        c.setGoogleReviewUrl("https://g.page/" + slug + "/review");
        c.setGoogleRating(new BigDecimal(ratingAvg));
        c.setContactEmail("hello@" + slug + ".com");
        return c;
    }
}
