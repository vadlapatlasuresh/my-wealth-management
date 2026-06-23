package com.mywealthmanagement.financialcoreservice.cpa;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.stream.Collectors;

/**
 * The CPA marketplace: browse verified CPAs, connect, and review. Reviewing is gated on
 * having a {@link CpaConnection} (mirrors the Deal Room's "express interest" gate before
 * contact). All errors surface as {@link ResponseStatusException}.
 */
@Service
@RequiredArgsConstructor
public class CpaService {

    private final CpaProfileRepository profileRepository;
    private final CpaReviewRepository reviewRepository;
    private final CpaConnectionRepository connectionRepository;

    /** Verified CPAs, best-rated first, optionally filtered by specialty and/or free-text query. */
    public List<CpaProfile> list(String specialty, String query) {
        String q = query == null ? null : query.trim().toLowerCase();
        List<CpaProfile> results = (q == null || q.isEmpty())
                ? profileRepository.findByLicenseVerifiedTrueOrderByRatingAvgDesc()
                : profileRepository.searchVerified(q);

        String spec = specialty == null ? null : specialty.trim().toUpperCase();
        if (spec == null || spec.isEmpty()) {
            return results;
        }
        return results.stream()
                .filter(c -> c.getSpecialtyList().stream()
                        .anyMatch(s -> s.equalsIgnoreCase(spec)))
                .collect(Collectors.toList());
    }

    /** A single CPA profile (404 if missing). */
    public CpaProfile get(Long id) {
        return profileRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "CPA not found"));
    }

    /** A CPA's reviews, newest first. */
    public List<CpaReview> reviews(Long cpaId) {
        get(cpaId); // 404 if the CPA does not exist
        return reviewRepository.findByCpaIdOrderByCreatedAtDesc(cpaId);
    }

    /** Idempotently record that the user connected with this CPA. No-op if already connected. */
    public void connect(Long userId, Long cpaId) {
        get(cpaId); // 404 if the CPA does not exist
        if (!connectionRepository.existsByCpaIdAndUserId(cpaId, userId)) {
            CpaConnection c = new CpaConnection();
            c.setCpaId(cpaId);
            c.setUserId(userId);
            connectionRepository.save(c);
        }
    }

    /**
     * Add a review. Allowed only if the user has connected with this CPA (else 403) and hasn't
     * already reviewed (else 409); rating must be 1..5 (else 400). On success the CPA's
     * {@code ratingAvg}/{@code reviewCount} are recomputed and persisted.
     */
    @Transactional
    public CpaReview addReview(Long userId, Long cpaId, int rating, String comment) {
        CpaProfile cpa = get(cpaId);
        if (rating < 1 || rating > 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rating must be between 1 and 5");
        }
        if (!connectionRepository.existsByCpaIdAndUserId(cpaId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Connect with this CPA before reviewing");
        }
        if (reviewRepository.existsByCpaIdAndUserId(cpaId, userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You've already reviewed this CPA");
        }

        CpaReview review = new CpaReview();
        review.setCpaId(cpaId);
        review.setUserId(userId);
        review.setRating(rating);
        review.setComment(comment == null ? null : comment.trim());
        review.setVerified(true); // gated by a verified connection
        CpaReview saved = reviewRepository.save(review);

        recomputeRating(cpa);
        return saved;
    }

    /** Recompute and persist the CPA's average rating and review count from all its reviews. */
    private void recomputeRating(CpaProfile cpa) {
        List<CpaReview> all = reviewRepository.findByCpaIdOrderByCreatedAtDesc(cpa.getId());
        int count = all.size();
        cpa.setReviewCount(count);
        if (count == 0) {
            cpa.setRatingAvg(null);
        } else {
            int sum = all.stream().mapToInt(CpaReview::getRating).sum();
            cpa.setRatingAvg(BigDecimal.valueOf(sum)
                    .divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP));
        }
        profileRepository.save(cpa);
    }
}
