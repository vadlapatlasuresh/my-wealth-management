package com.mywealthmanagement.financialcoreservice.tax.ocr;

import com.mywealthmanagement.financialcoreservice.tax.ocr.ParsedTaxDocument.ExtractedField;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the default mock (regex) parser across the supported form types: it detects the document,
 * extracts each box into the estimator field it maps to, and degrades gracefully on unreadable text.
 */
class TaxDocumentParserTest {

    private final TaxDocumentParser parser = new TaxDocumentParser("mock");

    private BigDecimal field(ParsedTaxDocument doc, String key) {
        Optional<ExtractedField> f = doc.fields().stream().filter(x -> x.key().equals(key)).findFirst();
        return f.map(ExtractedField::amount).orElse(null);
    }

    @Test
    void parsesW2TwoColumnLayout() {
        String w2 = """
                EMPLOYER PAYROLL CO
                Form W-2 Wage and Tax Statement 2025
                1 Wages, tips, other compensation   2 Federal income tax withheld
                84,200.00   9,310.00
                """;
        ParsedTaxDocument r = parser.parse(w2);
        assertThat(r.documentType()).isEqualTo("W2");
        assertThat(r.taxYear()).isEqualTo(2025);
        assertThat(field(r, "wages")).isEqualByComparingTo("84200.00");
        assertThat(field(r, "withholding")).isEqualByComparingTo("9310.00");
    }

    @Test
    void parsesW2WithRaggedWhitespaceAndWrappedCaption() {
        // Real PDFs extract with uneven spacing and captions that wrap across lines; whitespace
        // normalization lets the multi-word labels still match.
        String w2 = "ACME PAYROLL\nForm W-2   Wage and Tax Statement    2025\n"
                + "1    Wages,  tips,  other\ncompensation         2  Federal income tax withheld\n"
                + "   84,200.00              9,310.00\n";
        ParsedTaxDocument r = parser.parse(w2);
        assertThat(r.documentType()).isEqualTo("W2");
        assertThat(field(r, "wages")).isEqualByComparingTo("84200.00");
        assertThat(field(r, "withholding")).isEqualByComparingTo("9310.00");
    }

    @Test
    void parsesValueExtractedAboveItsLabel() {
        // Some PDFs surface the box value before its caption — the before-the-label fallback
        // catches it instead of leaving the field blank.
        String doc = "Form 1098-E Student Loan Interest Statement 2025\n2,180.45\n"
                + "1 Student loan interest received by lender";
        ParsedTaxDocument r = parser.parse(doc);
        assertThat(r.documentType()).isEqualTo("1098-E");
        assertThat(field(r, "studentLoanInterest")).isEqualByComparingTo("2180.45");
    }

    @Test
    void parses1099NecAsSelfEmployment() {
        String f = """
                Form 1099-NEC 2024
                Gig Platform Inc
                1 Nonemployee compensation   $ 23,500
                4 Federal income tax withheld   1,000
                """;
        ParsedTaxDocument r = parser.parse(f);
        assertThat(r.documentType()).isEqualTo("1099-NEC");
        assertThat(field(r, "selfEmploymentIncome")).isEqualByComparingTo("23500");
        assertThat(field(r, "withholding")).isEqualByComparingTo("1000");
    }

    @Test
    void parses1098MortgageInterest() {
        String f = """
                Form 1098 Mortgage Interest Statement 2025
                Box 1 Mortgage interest received from payer   12,840.55
                Box 10 Real estate taxes   6,200.00
                """;
        ParsedTaxDocument r = parser.parse(f);
        assertThat(r.documentType()).isEqualTo("1098");
        assertThat(field(r, "mortgageInterest")).isEqualByComparingTo("12840.55");
        assertThat(field(r, "propertyTaxes")).isEqualByComparingTo("6200.00");
    }

    @Test
    void parses1098EStudentLoanInterest() {
        String f = "Form 1098-E Student Loan Interest Statement 2025\nBox 1 Student loan interest received  2,150.00";
        ParsedTaxDocument r = parser.parse(f);
        assertThat(r.documentType()).isEqualTo("1098-E");
        assertThat(field(r, "studentLoanInterest")).isEqualByComparingTo("2150.00");
    }

    @Test
    void parses1099IntAndDiv() {
        ParsedTaxDocument intDoc = parser.parse("Form 1099-INT 2025\n1 Interest income   1,432.10");
        assertThat(intDoc.documentType()).isEqualTo("1099-INT");
        assertThat(field(intDoc, "interestIncome")).isEqualByComparingTo("1432.10");

        ParsedTaxDocument divDoc = parser.parse("Form 1099-DIV 2025\n1a Total ordinary dividends   3,765.00");
        assertThat(divDoc.documentType()).isEqualTo("1099-DIV");
        assertThat(field(divDoc, "dividendIncome")).isEqualByComparingTo("3765.00");
    }

    @Test
    void parses1099RRetirementDistribution() {
        String f = "Form 1099-R 2024\n1 Gross distribution   28,000.00\n4 Federal income tax withheld   2,800.00";
        ParsedTaxDocument r = parser.parse(f);
        assertThat(r.documentType()).isEqualTo("1099-R");
        assertThat(field(r, "retirementIncome")).isEqualByComparingTo("28000.00");
        assertThat(field(r, "withholding")).isEqualByComparingTo("2800.00");
    }

    @Test
    void unreadableTextDegradesGracefully() {
        ParsedTaxDocument r = parser.parse("just some scanned noise with no recognizable boxes");
        assertThat(r.fields()).isEmpty();
        assertThat(r.confidence()).isLessThan(0.5);
        assertThat(r.note()).isNotBlank();
    }

    @Test
    void parseKeyValues_w2FromTextractForms() {
        Map<String, String> kv = new LinkedHashMap<>();
        kv.put("Wages, tips, other compensation", "84,200.00");
        kv.put("Federal income tax withheld", "9,310.00");
        ParsedTaxDocument r = parser.parseKeyValues(kv);
        assertThat(r.documentType()).isEqualTo("W2");
        assertThat(r.source()).isEqualTo(TaxDocumentParser.SOURCE_TEXTRACT);
        assertThat(field(r, "wages")).isEqualByComparingTo("84200.00");
        assertThat(field(r, "withholding")).isEqualByComparingTo("9310.00");
    }

    @Test
    void parseKeyValues_1098FromTextractForms() {
        Map<String, String> kv = new LinkedHashMap<>();
        kv.put("Mortgage interest received from payer(s)/borrower(s)", "$12,840.55");
        kv.put("Real estate taxes", "6,200.00");
        ParsedTaxDocument r = parser.parseKeyValues(kv);
        assertThat(r.documentType()).isEqualTo("1098");
        assertThat(field(r, "mortgageInterest")).isEqualByComparingTo("12840.55");
        assertThat(field(r, "propertyTaxes")).isEqualByComparingTo("6200.00");
    }

    @Test
    void parseKeyValues_emptyDegradesGracefully() {
        ParsedTaxDocument r = parser.parseKeyValues(Map.of());
        assertThat(r.documentType()).isEqualTo("UNKNOWN");
        assertThat(r.fields()).isEmpty();
    }

    @Test
    void blankTextIsHandled() {
        ParsedTaxDocument r = parser.parse("   ");
        assertThat(r.documentType()).isEqualTo("UNKNOWN");
        assertThat(r.confidence()).isZero();
        assertThat(r.fields()).isEmpty();
    }
}
