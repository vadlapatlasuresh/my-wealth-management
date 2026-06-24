package com.mywealthmanagement.financialcoreservice.tax.ocr;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the default mock (regex) parser: it pulls Box 1 wages and Box 2 federal withholding out of
 * W-2 / 1099 text, detects the document type and year, and degrades gracefully on unreadable input.
 */
class TaxDocumentParserTest {

    private final TaxDocumentParser parser = new TaxDocumentParser("mock");

    @Test
    void parsesW2WagesAndWithholding() {
        String w2 = """
                ACME ROOFING LLC
                2025 W-2 Wage and Tax Statement
                Box 1 Wages, tips, other compensation     84,200.00
                Box 2 Federal income tax withheld          9,310.00
                Box 3 Social security wages               84,200.00
                """;

        ParsedTaxDocument r = parser.parse(w2);

        assertThat(r.documentType()).isEqualTo("W2");
        assertThat(r.taxYear()).isEqualTo(2025);
        assertThat(r.wages()).isEqualByComparingTo(new BigDecimal("84200.00"));
        assertThat(r.federalWithholding()).isEqualByComparingTo(new BigDecimal("9310.00"));
        assertThat(r.confidence()).isGreaterThanOrEqualTo(0.9);
        assertThat(r.source()).isEqualTo(TaxDocumentParser.SOURCE_MOCK);
    }

    @Test
    void parses1099NonemployeeCompensation() {
        String f1099 = """
                Form 1099-NEC 2024
                Payer: Gig Platform Inc
                Box 1 Nonemployee compensation   $ 23,500
                Federal income tax withheld        1,000
                """;

        ParsedTaxDocument r = parser.parse(f1099);

        assertThat(r.documentType()).isEqualTo("1099");
        assertThat(r.taxYear()).isEqualTo(2024);
        assertThat(r.wages()).isEqualByComparingTo(new BigDecimal("23500"));
        assertThat(r.federalWithholding()).isEqualByComparingTo(new BigDecimal("1000"));
    }

    @Test
    void unreadableTextReturnsLowConfidenceNotError() {
        ParsedTaxDocument r = parser.parse("just some random scanned noise with no boxes");
        assertThat(r.wages()).isNull();
        assertThat(r.federalWithholding()).isNull();
        assertThat(r.confidence()).isLessThan(0.5);
        assertThat(r.note()).isNotBlank();
    }

    @Test
    void blankTextIsHandled() {
        ParsedTaxDocument r = parser.parse("   ");
        assertThat(r.documentType()).isEqualTo("UNKNOWN");
        assertThat(r.confidence()).isZero();
    }
}
