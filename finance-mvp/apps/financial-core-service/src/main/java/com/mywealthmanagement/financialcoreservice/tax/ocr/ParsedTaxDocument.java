package com.mywealthmanagement.financialcoreservice.tax.ocr;

import java.math.BigDecimal;
import java.util.List;

/**
 * Fields extracted from an uploaded tax document (W-2, 1098, 1099-*, ...). Best-effort — the UI
 * presents these as suggestions the user confirms before they touch the estimate.
 *
 * <p>Each {@link ExtractedField#key} matches an estimator form field, so the frontend can route a
 * value straight to the right input (and sum across multiple uploaded documents).
 *
 * @param documentType "W2", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV", "1099-R", "1098",
 *                     "1098-E", "1098-T", or "UNKNOWN"
 * @param taxYear      the form's tax year if found (else null)
 * @param fields       the extracted (field, amount) pairs, each mapped to an estimator input key
 * @param confidence   0.0–1.0 — how much of the expected data was extracted
 * @param source       which engine produced this ("MOCK_REGEX" or e.g. "AWS_TEXTRACT")
 * @param note         short human-readable status (shown to the user)
 */
public record ParsedTaxDocument(
        String documentType,
        Integer taxYear,
        List<ExtractedField> fields,
        double confidence,
        String source,
        String note) {

    /**
     * One extracted figure mapped to an estimator form field.
     *
     * @param key    estimator input key (e.g. "wages", "withholding", "mortgageInterest")
     * @param label  human-readable label (e.g. "Wages (Box 1)")
     * @param amount the parsed dollar amount
     */
    public record ExtractedField(String key, String label, BigDecimal amount) {}
}
