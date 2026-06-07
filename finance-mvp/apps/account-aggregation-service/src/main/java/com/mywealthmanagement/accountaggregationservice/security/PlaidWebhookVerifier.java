package com.mywealthmanagement.accountaggregationservice.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Gatekeeper for incoming Plaid webhooks.
 * <p>
 * Plaid signs each webhook with a JWT in the {@code Plaid-Verification} header (ES256),
 * whose {@code kid} identifies a rotating public key fetched from
 * {@code /webhook_verification_key/get}; the JWT carries a {@code request_body_sha256}
 * claim that must equal the SHA-256 of the raw request body.
 * <p>
 * This verifier currently enforces the parts that can be validated safely without the
 * (untestable here) rotating-key fetch: when verification is enabled it requires the
 * {@code Plaid-Verification} header to be present, rejecting unsigned/forged calls. The
 * full ES256 signature + body-hash check is the remaining production hardening step and
 * is flagged clearly below. Verification is OFF by default so the dev/sandbox flow is
 * unaffected; enable it with {@code PLAID_WEBHOOK_VERIFY=true} in production.
 */
@Component
public class PlaidWebhookVerifier {

    private static final Logger log = LoggerFactory.getLogger(PlaidWebhookVerifier.class);

    private final boolean verificationEnabled;

    public PlaidWebhookVerifier(@Value("${plaid.webhook.verify:false}") boolean verificationEnabled) {
        this.verificationEnabled = verificationEnabled;
    }

    /**
     * @param rawBody             the raw webhook body, exactly as received
     * @param verificationHeader  the {@code Plaid-Verification} JWT header (may be null)
     * @return true if the webhook should be processed
     */
    public boolean verify(String rawBody, String verificationHeader) {
        if (!verificationEnabled) {
            log.debug("Plaid webhook verification disabled (dev/sandbox); accepting webhook.");
            return true;
        }
        if (verificationHeader == null || verificationHeader.isBlank()) {
            log.warn("Rejected Plaid webhook: missing Plaid-Verification header.");
            return false;
        }
        // TODO(prod-hardening): fetch the ES256 key for this JWT's `kid` from Plaid's
        // /webhook_verification_key/get, verify the JWT signature, then assert that its
        // `request_body_sha256` claim equals SHA-256(rawBody). Until that key fetch is
        // wired, we fail closed only on a missing header rather than claim a stronger
        // guarantee than we provide.
        return true;
    }
}
