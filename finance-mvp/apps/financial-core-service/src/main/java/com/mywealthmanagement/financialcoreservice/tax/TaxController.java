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
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

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

    /** The full set of categorized form fields persisted verbatim so the breakdown round-trips. */
    private static final List<String> DETAIL_FIELDS = List.of(
            "wages", "selfEmploymentIncome", "rentalIncome", "interestIncome", "dividendIncome",
            "retirementIncome", "otherIncome", "studentLoanInterest", "hsaContribution",
            "iraContribution", "otherAdjustments", "mortgageInterest", "propertyTaxes",
            "stateLocalTaxes", "charitable", "medicalExpenses");

    /** Create or update the user's saved tax profile. Stores both the aggregate columns (back-compat)
     *  and the full categorized breakdown as JSON so the detailed form repopulates on reload. */
    @PutMapping("/profile")
    public TaxProfile saveProfile(@RequestBody Map<String, Object> body) {
        TaxEstimateInput agg = inputFrom(body); // same aggregation the estimate uses
        TaxProfile p = new TaxProfile();
        p.setTaxYear(intVal(body.get("taxYear"), intVal(body.get("year"), 2025)));
        p.setFilingStatus(parseStatus(str(body.get("filingStatus"))).name());
        p.setGrossIncome(agg.grossIncome());
        p.setAdjustments(agg.adjustments());
        p.setItemizedDeductions(agg.itemizedDeductions());
        p.setDependentsUnder17(intVal(body.get("dependentsUnder17"), 0));
        p.setWithholding(num(body.get("withholding")));
        p.setDetailsJson(detailsJson(body));
        return taxProfileService.upsert(getUserId(), p);
    }

    /** Structured collections persisted alongside the scalar fields (joint filing / household docs). */
    private static final List<String> DETAIL_COLLECTIONS = List.of("filers", "w2s", "documents");

    /** Serialize the known categorized fields + the joint-filing collections to a compact JSON object. */
    private String detailsJson(Map<String, Object> body) {
        Map<String, Object> details = new java.util.LinkedHashMap<>();
        for (String key : DETAIL_FIELDS) {
            Object v = body.get(key);
            if (v != null && !v.toString().isBlank()) {
                details.put(key, num(v));
            }
        }
        // W-2 entries, filers and document metadata round-trip as-is (lists of objects).
        for (String key : DETAIL_COLLECTIONS) {
            Object v = body.get(key);
            if (v instanceof List<?> list && !list.isEmpty()) {
                details.put(key, v);
            }
        }
        try {
            return objectMapper.writeValueAsString(details);
        } catch (Exception e) {
            return null; // details are a convenience; never fail the save over them
        }
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

    /** SALT (state/local + property taxes) itemized deduction is capped at $10,000. */
    private static final BigDecimal SALT_CAP = BigDecimal.valueOf(10000);

    /**
     * Build the estimator input from the request body. Income, adjustments and itemized deductions
     * are each summed from their categories (with the SALT cap applied), so the estimator stays
     * simple. Legacy single-figure fields (grossIncome / adjustments / itemizedDeductions) are still
     * accepted and added in, so older callers keep working.
     */
    private TaxEstimateInput inputFrom(Map<String, Object> body) {
        BigDecimal selfEmployment = num(body.get("selfEmploymentIncome"));
        BigDecimal grossIncome = sum(
                num(body.get("wages")), selfEmployment, num(body.get("rentalIncome")),
                num(body.get("interestIncome")), num(body.get("dividendIncome")),
                num(body.get("retirementIncome")), num(body.get("otherIncome")),
                num(body.get("grossIncome"))); // legacy single field

        BigDecimal adjustments = sum(
                num(body.get("studentLoanInterest")), num(body.get("hsaContribution")),
                num(body.get("iraContribution")), num(body.get("otherAdjustments")),
                num(body.get("adjustments"))); // legacy single field

        BigDecimal salt = num(body.get("propertyTaxes")).add(num(body.get("stateLocalTaxes"))).min(SALT_CAP);
        BigDecimal itemized = sum(
                num(body.get("mortgageInterest")), salt, num(body.get("charitable")),
                num(body.get("medicalExpenses")),
                num(body.get("itemizedDeductions"))); // legacy single field

        return new TaxEstimateInput(
                parseStatus(str(body.get("filingStatus"))),
                grossIncome,
                adjustments,
                itemized,
                intVal(body.get("dependentsUnder17"), 0),
                num(body.get("withholding")),
                selfEmployment);
    }

    private static BigDecimal sum(BigDecimal... values) {
        BigDecimal total = BigDecimal.ZERO;
        for (BigDecimal v : values) {
            if (v != null) total = total.add(v);
        }
        return total;
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
