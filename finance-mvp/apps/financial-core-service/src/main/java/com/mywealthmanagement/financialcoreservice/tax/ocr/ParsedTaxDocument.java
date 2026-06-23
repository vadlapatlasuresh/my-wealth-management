package com.mywealthmanagement.financialcoreservice.tax.ocr;

import java.math.BigDecimal;

/**
 * Fields extracted from an uploaded W-2 / 1099. Everything is best-effort — the UI presents these
 * as a suggestion the user confirms before they touch the estimate, never as authoritative figures.
 *
 * @param documentType "W2", "1099", or "UNKNOWN"
 * @param taxYear      the form's tax year if found (else null)
 * @param wages        W-2 Box 1 wages / 1099 income → maps to the estimate's gross income
 * @param federalWithholding W-2 Box 2 / 1099 federal tax withheld → maps to withholding
 * @param payer        employer/payer name if found
 * @param confidence   0.0–1.0 — how much of the expected data was extracted
 * @param source       which engine produced this ("MOCK_REGEX" or e.g. "AWS_TEXTRACT")
 * @param note         short human-readable status (shown to the user)
 */
public record ParsedTaxDocument(
        String documentType,
        Integer taxYear,
        BigDecimal wages,
        BigDecimal federalWithholding,
        String payer,
        double confidence,
        String source,
        String note) {
}
