package com.mywealthmanagement.financialcoreservice.cpa;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * REST API for the CPA marketplace. Routed through the gateway at {@code /api/v1/cpa}.
 * Reviewer identity is never leaked: review responses carry only an anonymized initial.
 */
@RestController
@RequestMapping("/api/v1/cpa")
@RequiredArgsConstructor
public class CpaController {

    private final CpaService cpaService;

    /** Verified CPAs, best-rated first; optional specialty + free-text (q) filters. */
    @GetMapping
    public List<CpaProfile> list(@RequestParam(required = false) String specialty,
                                 @RequestParam(required = false) String q) {
        return cpaService.list(specialty, q);
    }

    /** A CPA's profile plus its reviews (reviewer identity anonymized). */
    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("profile", cpaService.get(id));
        out.put("reviews", cpaService.reviews(id).stream().map(CpaController::toReviewView).toList());
        return out;
    }

    /** Record the caller's connection with this CPA (idempotent). */
    @PostMapping("/{id}/connect")
    public Map<String, Object> connect(@PathVariable Long id) {
        cpaService.connect(getUserId(), id);
        return Map.of("connected", true);
    }

    /** Add a review (requires a prior connection). Returns the saved review, sans userId. */
    @PostMapping("/{id}/reviews")
    public Map<String, Object> addReview(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        int rating = intVal(body.get("rating"));
        String comment = body.get("comment") == null ? null : body.get("comment").toString();
        CpaReview saved = cpaService.addReview(getUserId(), id, rating, comment);
        return toReviewView(saved);
    }

    /** A non-identifying view of a review: rating, comment, verified, created-at, author initial. */
    private static Map<String, Object> toReviewView(CpaReview r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("cpaId", r.getCpaId());
        m.put("rating", r.getRating());
        m.put("comment", r.getComment());
        m.put("verified", r.isVerified());
        m.put("createdAt", r.getCreatedAt() == null ? null : r.getCreatedAt().toString());
        m.put("authorInitial", authorInitial(r));
        return m;
    }

    /** A single non-identifying initial derived from the comment (never from userId/email). */
    private static String authorInitial(CpaReview r) {
        String c = r.getComment();
        if (c != null) {
            String t = c.trim();
            if (!t.isEmpty()) {
                return t.substring(0, 1).toUpperCase();
            }
        }
        return "A"; // anonymous
    }

    private static int intVal(Object o) {
        if (o == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "rating is required");
        }
        try {
            return Integer.parseInt(o.toString().trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "rating must be a number");
        }
    }

    private static Long getUserId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        try { return Long.valueOf(auth.getName()); }
        catch (NumberFormatException e) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid session"); }
    }
}
