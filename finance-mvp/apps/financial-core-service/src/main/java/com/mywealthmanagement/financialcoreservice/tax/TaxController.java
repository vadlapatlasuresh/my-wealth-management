package com.mywealthmanagement.financialcoreservice.tax;

import com.mywealthmanagement.financialcoreservice.tax.ocr.ParsedTaxDocument;
import com.mywealthmanagement.financialcoreservice.tax.ocr.TaxDocumentParser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Educational federal tax estimate + the underlying rule set (for transparency/education).
 * Stateless for Phase 1 — the client sends the figures, we return the estimate; persisting
 * a saved Tax Profile is the next phase.
 */
@RestController
@RequestMapping("/api/v1/planning/tax")
@RequiredArgsConstructor
public class TaxController {

    private final TaxRules taxRules;
    private final TaxProfileService taxProfileService;
    private final TaxDocumentParser taxDocumentParser;
    private final TaxEstimateHistoryService taxEstimateHistoryService;

    /** Estimate federal tax from the supplied figures, with deduction/credit tips. NOT tax advice. */
    @PostMapping("/estimate")
    public TaxEstimate estimate(@RequestBody Map<String, Object> body) {
        TaxRuleSet rules = taxRules.forYear(intVal(body.get("year"), null));
        TaxEstimateInput in = inputFrom(body);
        TaxEstimate estimate = TaxEstimator.estimate(in, rules);
        estimate.setInsights(TaxInsights.generate(in, estimate, rules));
        // Persist this year's latest estimate for the history view (best-effort — never fail the
        // estimate over a history write).
        try {
            taxEstimateHistoryService.record(getUserId(), estimate);
        } catch (Exception ignored) {
            // history is a convenience; the estimate itself must always succeed
        }
        return estimate;
    }

    /** The user's year-over-year estimate history (most recent tax year first). */
    @GetMapping("/estimates")
    public List<TaxEstimateSnapshot> history() {
        return taxEstimateHistoryService.list(getUserId());
    }

    /** The user's saved tax profile (or 404 if none saved yet). */
    @GetMapping("/profile")
    public TaxProfile getProfile() {
        return taxProfileService.get(getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No tax profile saved"));
    }

    /** Create or update the user's saved tax profile. */
    @PutMapping("/profile")
    public TaxProfile saveProfile(@RequestBody Map<String, Object> body) {
        TaxProfile p = new TaxProfile();
        p.setTaxYear(intVal(body.get("taxYear"), intVal(body.get("year"), 2025)));
        p.setFilingStatus(parseStatus(str(body.get("filingStatus"))).name());
        p.setGrossIncome(num(body.get("grossIncome")));
        p.setAdjustments(num(body.get("adjustments")));
        p.setItemizedDeductions(num(body.get("itemizedDeductions")));
        p.setDependentsUnder17(intVal(body.get("dependentsUnder17"), 0));
        p.setWithholding(num(body.get("withholding")));
        return taxProfileService.upsert(getUserId(), p);
    }

    /** Suggested pre-fill from the user's linked accounts (rough; the user confirms it). */
    @GetMapping("/prefill")
    public Map<String, Object> prefill() {
        BigDecimal income = taxProfileService.suggestAnnualIncome(getAuthorizationHeader());
        Map<String, Object> out = new HashMap<>();
        out.put("grossIncome", income);
        out.put("source", income == null ? "none" : "linked-account deposits");
        out.put("note", "Estimated from your deposits over the available history — please verify and edit.");
        return out;
    }

    /** The rule set used for a given year (brackets, standard deduction, CTC) — for education. */
    @GetMapping("/rules")
    public TaxRuleSet rules(@RequestParam(required = false) Integer year) {
        return taxRules.forYear(year);
    }

    /** Tax years the estimator currently supports. */
    @GetMapping("/years")
    public List<Integer> years() {
        return taxRules.availableYears();
    }

    /** Plain-English catalog of common deductions & credits a user might be able to claim. */
    @GetMapping("/guide")
    public List<TaxGuide.GuideItem> guide() {
        return TaxGuide.all();
    }

    /**
     * Parse an uploaded W-2 / 1099 (its extracted text) into suggested figures for the estimate.
     * Best-effort and stateless — nothing is stored; the user confirms before anything is applied.
     * Body: {@code { "text": "<document text>" }}.
     */
    @PostMapping("/documents/parse")
    public ParsedTaxDocument parseDocument(@RequestBody Map<String, Object> body) {
        getUserId(); // require auth
        return taxDocumentParser.parse(str(body.get("text")));
    }

    private TaxEstimateInput inputFrom(Map<String, Object> body) {
        return new TaxEstimateInput(
                parseStatus(str(body.get("filingStatus"))),
                num(body.get("grossIncome")),
                num(body.get("adjustments")),
                num(body.get("itemizedDeductions")),
                intVal(body.get("dependentsUnder17"), 0),
                num(body.get("withholding")));
    }

    private static Long getUserId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        try { return Long.valueOf(auth.getName()); }
        catch (NumberFormatException e) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid session"); }
    }

    private static String getAuthorizationHeader() {
        Object creds = SecurityContextHolder.getContext().getAuthentication().getCredentials();
        String token = creds != null ? creds.toString() : "";
        return token.startsWith("Bearer ") ? token : "Bearer " + token;
    }

    private static FilingStatus parseStatus(String s) {
        if (s == null || s.isBlank()) return FilingStatus.SINGLE;
        try {
            return FilingStatus.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "filingStatus must be SINGLE, MARRIED_JOINT, MARRIED_SEPARATE, or HEAD_OF_HOUSEHOLD");
        }
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }

    private static BigDecimal num(Object o) {
        if (o == null) return BigDecimal.ZERO;
        try { return new BigDecimal(o.toString().replace(",", "").trim()); }
        catch (NumberFormatException e) { return BigDecimal.ZERO; }
    }

    private static Integer intVal(Object o, Integer dflt) {
        if (o == null) return dflt;
        try { return Integer.valueOf(o.toString().trim()); }
        catch (NumberFormatException e) { return dflt; }
    }
}
