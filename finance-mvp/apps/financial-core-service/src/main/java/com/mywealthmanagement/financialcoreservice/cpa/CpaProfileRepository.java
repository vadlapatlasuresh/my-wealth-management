package com.mywealthmanagement.financialcoreservice.cpa;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CpaProfileRepository extends JpaRepository<CpaProfile, Long> {

    /** Approved CPAs, best-rated first (null ratings sort last). The "Verified" badge is a
     *  separate signal (licenseVerified); approval is what makes a listing publicly visible. */
    @Query("select c from CpaProfile c where c.status = 'APPROVED' " +
            "order by c.ratingAvg desc nulls last, c.reviewCount desc")
    List<CpaProfile> findApproved();

    /**
     * Approved CPAs whose name, firm or specialties contain the (lowercased) term,
     * best-rated first. Used for the directory search box.
     */
    @Query("select c from CpaProfile c where c.status = 'APPROVED' and (" +
            "lower(c.name) like concat('%', :q, '%') or " +
            "lower(c.firm) like concat('%', :q, '%') or " +
            "lower(c.specialties) like concat('%', :q, '%')) " +
            "order by c.ratingAvg desc nulls last, c.reviewCount desc")
    List<CpaProfile> searchApproved(@Param("q") String q);

    /** Pending self-registrations awaiting admin review, oldest first (FIFO queue). */
    @Query("select c from CpaProfile c where c.status = 'PENDING' order by c.submittedAt asc nulls last, c.id asc")
    List<CpaProfile> findPending();
}
