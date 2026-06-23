package com.mywealthmanagement.financialcoreservice.cpa.verify;

/**
 * Outcome of a CPA license check.
 *
 * @param verified whether the (state, licenseNumber) pair is an active CPA license
 * @param source   which provider produced this result ("NASBA_CPAVERIFY" or "MOCK")
 * @param detail   short human-readable explanation (shown to staff in the moderation queue)
 */
public record LicenseVerificationResult(boolean verified, String source, String detail) {
}
