package com.mywealthmanagement.financialcoreservice.cpa.verify;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the offline mock provider (the default when no live NASBA credentials are configured).
 * A well-formed license in a named state passes; missing/garbled input fails. Always labeled MOCK.
 */
class LicenseVerifierTest {

    /** Default construction = mock provider (no base-url/api-key). */
    private final LicenseVerifier verifier = new LicenseVerifier("mock", "", "");

    @Test
    void notLiveWithoutConfig() {
        assertThat(verifier.isLiveProvider()).isFalse();
        // provider=nasba but no base-url/key is still not live (degrades to mock).
        assertThat(new LicenseVerifier("nasba", "", "").isLiveProvider()).isFalse();
    }

    @Test
    void wellFormedLicenseVerifiesViaMock() {
        LicenseVerificationResult r = verifier.verify("TX", "TX-104882", "Maria Gonzalez");
        assertThat(r.verified()).isTrue();
        assertThat(r.source()).isEqualTo(LicenseVerifier.SOURCE_MOCK);
    }

    @Test
    void garbledLicenseFailsFormatCheck() {
        assertThat(verifier.verify("TX", "x", "Bad").verified()).isFalse();
    }

    @Test
    void missingStateOrNumberFails() {
        assertThat(verifier.verify("", "TX-1", "No state").verified()).isFalse();
        assertThat(verifier.verify("TX", "  ", "No number").verified()).isFalse();
    }
}
