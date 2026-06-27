package com.mywealthmanagement.financialcoreservice.tax.ocr;

import com.mywealthmanagement.financialcoreservice.tax.ocr.ParsedTaxDocument.ExtractedField;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts the figures the tax estimator needs from the text of common tax documents — W-2,
 * 1098 (mortgage interest), 1098-E (student loan interest), 1098-T (tuition), and the 1099 family
 * (NEC, MISC, INT, DIV, R). Each extracted value is tagged with the estimator field it maps to, so
 * the UI can route it straight into the right input and sum across several uploaded documents.
 *
 * <p>Flag-gated with a mock fallback — the convention every integration here follows. The default
 * {@code tax.ocr.provider=mock} runs a deterministic regex pass over the document text (works for
 * text / text-based-PDF input and is what the unit tests cover). A real OCR engine
 * ({@code provider=textract}) would supply image text upstream; that path degrades to this same
 * regex pass. Nothing is persisted — the document is parsed in-memory and discarded.
 */
@Component
public class TaxDocumentParser {

    public static final String SOURCE_MOCK = "MOCK_REGEX";
    public static final String SOURCE_TEXTRACT = "AWS_TEXTRACT";

    // Either a comma-grouped number (84,200.00) OR a plain run of digits (2025). The grouped
    // alternative requires at least one comma group, so "2025" isn't truncated to "202".
    private static final Pattern AMOUNT = Pattern.compile(
            "\\$?\\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)");
    private static final Pattern YEAR = Pattern.compile("\\b(20[0-9]{2})\\b");

    /** A field to look for: which estimator input it maps to, its label, and the text it sits near. */
    private record FieldSpec(String key, String label, boolean excludePriorValue, String... labels) {}

    private final String provider;

    public TaxDocumentParser(@Value("${tax.ocr.provider:mock}") String provider) {
        this.provider = provider == null ? "mock" : provider.trim().toLowerCase();
    }

    /** True when a live OCR engine is selected (real image OCR). Currently only the mock ships. */
    public boolean isLiveProvider() {
        return !"mock".equals(provider);
    }

    /**
     * Parse a tax document from its extracted text. Never throws — an unreadable document returns a
     * low-confidence result with a helpful note rather than an error.
     */
    public ParsedTaxDocument parse(String text) {
        if (!StringUtils.hasText(text)) {
            return new ParsedTaxDocument("UNKNOWN", null, List.of(), 0.0, SOURCE_MOCK,
                    "No readable text found — please enter the figures manually.");
        }

        // Collapse irregular PDF whitespace (runs of spaces, mid-label newlines from boxed
        // layouts) into single spaces so multi-word labels like "wages, tips, other" still
        // match and the value can be found even when it sat on a different visual line.
        String norm = text.replaceAll("\\s+", " ");
        String lower = norm.toLowerCase(java.util.Locale.ROOT);
        String type = detectType(lower);
        List<FieldSpec> specs = specsFor(type);

        List<ExtractedField> fields = new ArrayList<>();
        BigDecimal primary = null; // the form's main income figure, so withholding doesn't reuse it
        for (FieldSpec spec : specs) {
            BigDecimal amt = amountNear(norm, lower, spec.excludePriorValue() ? primary : null, spec.labels());
            if (amt != null) {
                fields.add(new ExtractedField(spec.key(), spec.label(), amt));
                if (!spec.excludePriorValue() && primary == null) {
                    primary = amt;
                }
            }
        }

        Integer year = year(norm);
        double confidence = fields.isEmpty() ? 0.2 : (fields.size() >= expectedFor(type) ? 0.9 : 0.6);
        String note = note(type, fields);
        return new ParsedTaxDocument(type, year, fields, confidence, SOURCE_MOCK, note);
    }

    /**
     * Parse from Textract FORMS key/value pairs (key = box label, value = box amount). Because
     * Textract pairs each label with its value regardless of 2-D position, this reads any layout —
     * matching the same field labels against the KV keys instead of a sliding text window.
     */
    public ParsedTaxDocument parseKeyValues(Map<String, String> kv) {
        if (kv == null || kv.isEmpty()) {
            return new ParsedTaxDocument("UNKNOWN", null, List.of(), 0.0, SOURCE_TEXTRACT,
                    "Couldn't read this document — please enter the figures manually.");
        }
        String combined = String.join(" \n ", kv.keySet()).toLowerCase();
        String type = detectType(combined);
        List<FieldSpec> specs = specsFor(type);

        List<ExtractedField> fields = new ArrayList<>();
        BigDecimal primary = null;
        for (FieldSpec spec : specs) {
            BigDecimal amt = amountForLabels(kv, spec.excludePriorValue() ? primary : null, spec.labels());
            if (amt != null) {
                fields.add(new ExtractedField(spec.key(), spec.label(), amt));
                if (!spec.excludePriorValue() && primary == null) {
                    primary = amt;
                }
            }
        }

        Integer year = year(combined + " " + String.join(" ", kv.values()));
        double confidence = fields.isEmpty() ? 0.2 : (fields.size() >= expectedFor(type) ? 0.95 : 0.7);
        String note = note(type, fields);
        return new ParsedTaxDocument(type, year, fields, confidence, SOURCE_TEXTRACT, note);
    }

    /** The amount from the first KV entry whose key contains one of the labels (skipping {@code exclude}). */
    private BigDecimal amountForLabels(Map<String, String> kv, BigDecimal exclude, String... labels) {
        for (String label : labels) {
            for (Map.Entry<String, String> e : kv.entrySet()) {
                if (e.getKey().toLowerCase().contains(label)) {
                    BigDecimal amt = firstAmount(e.getValue());
                    if (amt != null && (exclude == null || amt.compareTo(exclude) != 0)) {
                        return amt;
                    }
                }
            }
        }
        return null;
    }

    /** Parse the first number out of a Textract value cell (no minimum — the value IS the box amount). */
    private BigDecimal firstAmount(String value) {
        Matcher m = AMOUNT.matcher(value == null ? "" : value);
        if (m.find()) {
            try {
                return new BigDecimal(m.group(1).replace(",", "").trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private String detectType(String lower) {
        // Order matters: more specific markers first.
        if (lower.contains("1098-e") || lower.contains("student loan interest")) return "1098-E";
        if (lower.contains("1098-t") || lower.contains("tuition statement")) return "1098-T";
        if (lower.contains("1099-nec") || lower.contains("nonemployee compensation")) return "1099-NEC";
        if (lower.contains("1099-misc")) return "1099-MISC";
        if (lower.contains("1099-int")) return "1099-INT";
        if (lower.contains("1099-div")) return "1099-DIV";
        if (lower.contains("1099-r")) return "1099-R";
        if (lower.contains("1098") || lower.contains("mortgage interest")) return "1098";
        if (lower.contains("1099")) return "1099-MISC"; // generic 1099 → treat as misc income
        if (lower.contains("w-2") || lower.contains("w2") || lower.contains("wage and tax statement")
                || lower.contains("wages, tips") || lower.contains("wages tips")) return "W2";
        return "UNKNOWN";
    }

    /** Which fields to look for, per document type (order = extraction priority). */
    private List<FieldSpec> specsFor(String type) {
        return switch (type) {
            case "W2" -> List.of(
                    new FieldSpec("wages", "Wages (Box 1)", false,
                            "wages, tips, other", "wages, tips", "wages,tips", "wages tips",
                            "box 1", "box1", "1 wages", "1 wages, tips"),
                    new FieldSpec("withholding", "Federal tax withheld (Box 2)", true,
                            "federal income tax withheld", "fed income tax withheld", "federal tax withheld",
                            "income tax withheld", "box 2", "box2", "2 federal"));
            case "1099-NEC" -> List.of(
                    new FieldSpec("selfEmploymentIncome", "Nonemployee compensation (Box 1)", false,
                            "nonemployee compensation", "box 1", "box1"),
                    new FieldSpec("withholding", "Federal tax withheld (Box 4)", true,
                            "federal income tax withheld", "box 4", "box4"));
            case "1099-MISC" -> List.of(
                    new FieldSpec("rentalIncome", "Rents (Box 1)", false, "rents", "box 1", "box1"),
                    new FieldSpec("withholding", "Federal tax withheld (Box 4)", true,
                            "federal income tax withheld", "box 4", "box4"));
            case "1099-INT" -> List.of(
                    new FieldSpec("interestIncome", "Interest income (Box 1)", false,
                            "interest income", "box 1", "box1"),
                    new FieldSpec("withholding", "Federal tax withheld (Box 4)", true,
                            "federal income tax withheld", "box 4", "box4"));
            case "1099-DIV" -> List.of(
                    new FieldSpec("dividendIncome", "Ordinary dividends (Box 1a)", false,
                            "ordinary dividends", "total ordinary dividends", "box 1a", "1a"),
                    new FieldSpec("withholding", "Federal tax withheld (Box 4)", true,
                            "federal income tax withheld", "box 4", "box4"));
            case "1099-R" -> List.of(
                    new FieldSpec("retirementIncome", "Gross distribution (Box 1)", false,
                            "gross distribution", "box 1", "box1"),
                    new FieldSpec("withholding", "Federal tax withheld (Box 4)", true,
                            "federal income tax withheld", "box 4", "box4"));
            case "1098" -> List.of(
                    new FieldSpec("mortgageInterest", "Mortgage interest (Box 1)", false,
                            "mortgage interest received from", "mortgage interest received", "mortgage interest",
                            "interest received from payer", "box 1", "box1", "1 mortgage"),
                    new FieldSpec("propertyTaxes", "Real estate / property taxes", false,
                            "real estate taxes", "property taxes paid", "property tax", "property taxes"));
            case "1098-E" -> List.of(
                    // "received" targets the box, not the form's "Student Loan Interest Statement" title.
                    new FieldSpec("studentLoanInterest", "Student loan interest (Box 1)", false,
                            "student loan interest received", "box 1", "box1"));
            case "1098-T" -> List.of(
                    new FieldSpec("tuition", "Qualified tuition (Box 1)", false,
                            "payments received", "qualified tuition", "box 1", "box1"));
            default -> List.of();
        };
    }

    private int expectedFor(String type) {
        // W-2 and 1099s carry both an income figure and withholding; the 1098 family is single-field.
        return switch (type) {
            case "W2", "1099-NEC", "1099-MISC", "1099-INT", "1099-DIV", "1099-R" -> 2;
            default -> 1;
        };
    }

    private String note(String type, List<ExtractedField> fields) {
        if ("UNKNOWN".equals(type) && fields.isEmpty()) {
            return "Couldn't recognize this form — you can still enter the figures manually.";
        }
        if (fields.isEmpty()) {
            return "Recognized a " + type + " but couldn't read the boxes — enter the figures manually.";
        }
        if ("1098-T".equals(type)) {
            return "Found tuition — you may qualify for an education credit (see What you can claim).";
        }
        return "Found " + fields.size() + " figure" + (fields.size() == 1 ? "" : "s")
                + " on your " + type + " — please double-check before using.";
    }

    /** The first non-blank, non-numeric line — a reasonable guess at the employer/payer name. */
    private Integer year(String text) {
        Matcher m = YEAR.matcher(text);
        Integer best = null;
        while (m.find()) {
            int y = Integer.parseInt(m.group(1));
            if (y >= 2015 && y <= 2099) best = y;
        }
        return best;
    }

    /**
     * The dollar amount nearest a label. Two passes over the labels (tried in order):
     * <ol>
     *   <li>the first money-like amount in the ~200 chars <em>after</em> the label — the usual
     *       reading order, where the box value follows or sits below its caption; then</li>
     *   <li>the nearest money-like amount in the ~80 chars <em>before</em> the label — for the
     *       value-above-label layouts some W-2/1099 PDFs extract to.</li>
     * </ol>
     * An amount equal to {@code exclude} is skipped so withholding doesn't grab the income figure
     * that shares its row; box numbers and other sub-$100 tokens are dropped by {@link #toAmount}.
     */
    private BigDecimal amountNear(String text, String lower, BigDecimal exclude, String... labels) {
        // Pass 1 — after the label.
        for (String label : labels) {
            int idx = lower.indexOf(label);
            while (idx >= 0) {
                int from = idx + label.length();
                int to = Math.min(text.length(), from + 200);
                BigDecimal amt = firstAmount(text.substring(from, to), exclude);
                if (amt != null) return amt;
                idx = lower.indexOf(label, idx + 1);
            }
        }
        // Pass 2 — fall back to the closest amount before the label.
        for (String label : labels) {
            int idx = lower.indexOf(label);
            while (idx >= 0) {
                int from = Math.max(0, idx - 80);
                BigDecimal amt = lastAmount(text.substring(from, idx), exclude);
                if (amt != null) return amt;
                idx = lower.indexOf(label, idx + 1);
            }
        }
        return null;
    }

    /** First money-like amount in {@code window} that isn't {@code exclude}. */
    private BigDecimal firstAmount(String window, BigDecimal exclude) {
        Matcher m = AMOUNT.matcher(window);
        while (m.find()) {
            BigDecimal amt = toAmount(m.group(1));
            if (amt != null && (exclude == null || amt.compareTo(exclude) != 0)) return amt;
        }
        return null;
    }

    /** Last money-like amount in {@code window} that isn't {@code exclude} (closest before a label). */
    private BigDecimal lastAmount(String window, BigDecimal exclude) {
        Matcher m = AMOUNT.matcher(window);
        BigDecimal last = null;
        while (m.find()) {
            BigDecimal amt = toAmount(m.group(1));
            if (amt != null && (exclude == null || amt.compareTo(exclude) != 0)) last = amt;
        }
        return last;
    }

    private BigDecimal toAmount(String raw) {
        try {
            BigDecimal v = new BigDecimal(raw.replace(",", "").trim());
            // Ignore obviously-non-money tokens (a stray box number like "1" or "2").
            return v.compareTo(BigDecimal.valueOf(100)) >= 0 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
