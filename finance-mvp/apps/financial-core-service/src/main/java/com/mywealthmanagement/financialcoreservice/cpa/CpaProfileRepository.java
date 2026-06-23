package com.mywealthmanagement.financialcoreservice.cpa;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CpaProfileRepository extends JpaRepository<CpaProfile, Long> {

    /** Verified CPAs, best-rated first (null ratings sort last). */
    @Query("select c from CpaProfile c where c.licenseVerified = true " +
            "order by c.ratingAvg desc nulls last, c.reviewCount desc")
    List<CpaProfile> findByLicenseVerifiedTrueOrderByRatingAvgDesc();

    /**
     * Verified CPAs whose name, firm or specialties contain the (lowercased) term,
     * best-rated first. Used for the directory search box.
     */
    @Query("select c from CpaProfile c where c.licenseVerified = true and (" +
            "lower(c.name) like concat('%', :q, '%') or " +
            "lower(c.firm) like concat('%', :q, '%') or " +
            "lower(c.specialties) like concat('%', :q, '%')) " +
            "order by c.ratingAvg desc nulls last, c.reviewCount desc")
    List<CpaProfile> searchVerified(@Param("q") String q);
}
