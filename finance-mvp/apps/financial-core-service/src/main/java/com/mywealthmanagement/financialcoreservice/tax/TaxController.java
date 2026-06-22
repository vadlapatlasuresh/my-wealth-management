package com.mywealthmanagement.financialcoreservice.tax;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
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

    /** Estimate federal tax from the supplied figures. NOT tax advice. */
    @PostMapping("/estimate")
    public TaxEstimate estimate(@RequestBody Map<String, Object> body) {
        TaxRuleSet rules = taxRules.forYear(intVal(body.get("year"), null));
        TaxEstimateInput in = new TaxEstimateInput(
                parseStatus(str(body.get("filingStatus"))),
                num(body.get("grossIncome")),
                num(body.get("adjustments")),
                num(body.get("itemizedDeductions")),
                intVal(body.get("dependentsUnder17"), 0),
                num(body.get("withholding")));
        return TaxEstimator.estimate(in, rules);
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
