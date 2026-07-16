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

    /**
     * Self-registration: a member lists their (or a) CPA practice. The listing is created
     * PENDING and stays invisible until an admin approves it. Returns the new id + status.
     */
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> register(@RequestBody Map<String, Object> body) {
        CpaProfile draft = new CpaProfile();
        draft.setName(str(body.get("name")));
        draft.setFirm(str(body.get("firm")));
        draft.setCredentials(str(body.get("credentials")));
        draft.setLicenseState(str(body.get("licenseState")));
        draft.setLicenseNumber(str(body.get("licenseNumber")));
        draft.setSpecialties(specialtiesCsv(body.get("specialties")));
        draft.setLocation(str(body.get("location")));
        draft.setFeeModel(str(body.get("feeModel")));
        draft.setYearsExperience(body.get("yearsExperience") == null ? 0 : optInt(body.get("yearsExperience")));
        draft.setBio(str(body.get("bio")));
        draft.setWebsiteUrl(str(body.get("websiteUrl")));
        draft.setGoogleReviewUrl(str(body.get("googleReviewUrl")));
        draft.setGoogleRating(decimal(body.get("googleRating")));
        draft.setContactEmail(str(body.get("contactEmail")));
        draft.setPhone(str(body.get("phone")));

        CpaProfile saved = cpaService.register(getUserId(), draft);
        return Map.of("id", saved.getId(), "status", saved.getStatus());
    }

    /** Admin/care: pending self-registrations awaiting review (oldest first). */
    @GetMapping("/admin/pending")
    public List<CpaProfile> pending() {
        requireStaff();
        return cpaService.listPending();
    }

    /** Admin/care: approve a pending listing (makes it publicly visible). */
    @PostMapping("/admin/{id}/approve")
    public Map<String, Object> approve(@PathVariable Long id) {
        requireStaff();
        return Map.of("id", id, "status", cpaService.moderate(id, true).getStatus());
    }

    /** Admin/care: reject a pending listing. */
    @PostMapping("/admin/{id}/reject")
    public Map<String, Object> reject(@PathVariable Long id) {
        requireStaff();
        return Map.of("id", id, "status", cpaService.moderate(id, false).getStatus());
    }

    /** Admin/care: run (or re-run) the NASBA CPAVerify license check and persist the outcome. */
    @PostMapping("/admin/{id}/verify")
    public Map<String, Object> verify(@PathVariable Long id) {
        requireStaff();
        CpaProfile c = cpaService.verifyLicense(id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", c.getId());
        out.put("licenseVerified", c.isLicenseVerified());
        out.put("verificationSource", c.getVerificationSource());
        out.put("licenseVerifiedAt", c.getLicenseVerifiedAt() == null ? null : c.getLicenseVerifiedAt().toString());
        return out;
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

    /**
     * Require an ops-staff role (from the JWT) for moderation actions; else 403.
     *
     * Ops staff hold OPS_* roles on a typ=ops token. The old CARE/ADMIN member roles are gone:
     * they lived on customer rows, which made an agent's token a valid member token everywhere.
     * JwtAuthFilter already restricts /api/v1/cpa/admin/** to ops tokens; this is defence in depth.
     * Phase 2 replaces this with a per-permission check.
     */
    private static void requireStaff() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        boolean staff = auth.getAuthorities().stream()
                .map(a -> a.getAuthority() == null ? "" : a.getAuthority().toUpperCase())
                .anyMatch(a -> a.startsWith("ROLE_OPS_"));
        if (!staff) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Staff access required");
        }
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }

    /** Accept specialties as a comma-string or a JSON array; store as an upper-cased CSV. */
    private static String specialtiesCsv(Object o) {
        if (o == null) return null;
        if (o instanceof List<?> list) {
            return list.stream().map(String::valueOf).map(String::trim)
                    .filter(s -> !s.isEmpty()).map(String::toUpperCase)
                    .collect(java.util.stream.Collectors.joining(","));
        }
        String s = o.toString().trim();
        return s.isEmpty() ? null : s.toUpperCase();
    }

    private static int optInt(Object o) {
        try { return Integer.parseInt(o.toString().trim()); }
        catch (Exception e) { return 0; }
    }

    private static java.math.BigDecimal decimal(Object o) {
        if (o == null) return null;
        try {
            String s = o.toString().trim();
            return s.isEmpty() ? null : new java.math.BigDecimal(s);
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "googleRating must be a number");
        }
    }
}
