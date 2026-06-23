package com.mywealthmanagement.financialcoreservice.tax.ocr;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts the figures the tax estimator needs (wages, federal withholding) from the text of a
 * W-2 / 1099.
 *
 * <p>Flag-gated with a mock fallback — the convention every integration here follows. The default
 * {@code tax.ocr.provider=mock} runs a deterministic regex pass over the document text (works for
 * text/text-based-PDF input and is what the unit tests cover). Setting {@code provider=textract}
 * (or another OCR engine) plus credentials would run real image OCR; that path is a stub that
 * degrades to the regex pass so the feature never hard-fails. Nothing is persisted — the document
 * is parsed in-memory and discarded.
 */
@Component
public class TaxDocumentParser {

    private static final Logger log = LoggerFactory.getLogger(TaxDocumentParser.class);

    public static final String SOURCE_MOCK = "MOCK_REGEX";

    // A US-format dollar amount, optionally with $ and thousands separators.
    private static final Pattern AMOUNT = Pattern.compile("\\$?\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)");
    private static final Pattern YEAR = Pattern.compile("\\b(20[0-9]{2})\\b");

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
            return new ParsedTaxDocument("UNKNOWN", null, null, null, null, 0.0, sourceLabel(),
                    "No readable text found — please enter the figures manually.");
        }
        // The live provider would OCR image bytes into text upstream; here we already have text, so
        // both paths converge on the same field extraction.
        if (isLiveProvider()) {
            log.debug("tax.ocr.provider={} selected; using regex extraction over provided text", provider);
        }

        String lower = text.toLowerCase();
        String type = detectType(lower);

        BigDecimal wages = amountNear(text, lower,
                "wages, tips", "wages,tips", "box 1", "box1", "nonemployee compensation", "gross distribution");
        BigDecimal withholding = amountNear(text, lower,
                "federal income tax withheld", "federal income tax", "box 2", "box2", "fed income tax withheld");
        Integer year = year(text);
        String payer = firstLine(text);

        int hits = (wages != null ? 1 : 0) + (withholding != null ? 1 : 0);
        double confidence = switch (hits) {
            case 2 -> 0.9;
            case 1 -> 0.6;
            default -> 0.2;
        };
        String note = switch (hits) {
            case 2 -> "Found wages and federal withholding — please double-check before using.";
            case 1 -> "Found one figure — review and fill in anything missing.";
            default -> "Couldn't read the key boxes — you can still enter the figures manually.";
        };
        return new ParsedTaxDocument(type, year, wages, withholding, payer, confidence, sourceLabel(), note);
    }

    private String sourceLabel() {
        return SOURCE_MOCK; // only the regex engine ships today; live OCR degrades to it
    }

    private String detectType(String lower) {
        if (lower.contains("w-2") || lower.contains("w2") || lower.contains("wage and tax statement")) {
            return "W2";
        }
        if (lower.contains("1099")) {
            return "1099";
        }
        return "UNKNOWN";
    }

    /** The first non-blank line — a reasonable guess at the employer/payer name. */
    private String firstLine(String text) {
        for (String line : text.split("\\r?\\n")) {
            String t = line.trim();
            if (t.length() >= 3 && !t.matches(".*\\d{2,}.*")) {
                return t.length() > 80 ? t.substring(0, 80) : t;
            }
        }
        return null;
    }

    private Integer year(String text) {
        Matcher m = YEAR.matcher(text);
        Integer best = null;
        while (m.find()) {
            int y = Integer.parseInt(m.group(1));
            if (y >= 2015 && y <= 2099) {
                best = y; // last plausible year on the form wins (forms repeat the year near the boxes)
            }
        }
        return best;
    }

    /**
     * Find the first dollar amount that appears within ~60 chars after any of the given labels
     * (labels tried in order). Labels match case-insensitively against {@code lower}; the amount is
     * read from the original {@code text} at the same offset.
     */
    private BigDecimal amountNear(String text, String lower, String... labels) {
        for (String label : labels) {
            int idx = lower.indexOf(label);
            while (idx >= 0) {
                int from = idx + label.length();
                int to = Math.min(text.length(), from + 60);
                Matcher m = AMOUNT.matcher(text.substring(from, to));
                while (m.find()) {
                    BigDecimal amt = toAmount(m.group(1));
                    if (amt != null) {
                        return amt;
                    }
                }
                idx = lower.indexOf(label, idx + 1);
            }
        }
        return null;
    }

    private BigDecimal toAmount(String raw) {
        try {
            BigDecimal v = new BigDecimal(raw.replace(",", "").trim());
            // Ignore obviously-non-money tokens (e.g. a stray box number like "1" or "2").
            return v.compareTo(BigDecimal.valueOf(100)) >= 0 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
