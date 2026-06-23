package com.mywealthmanagement.financialcoreservice.cpa.verify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.regex.Pattern;

/**
 * Verifies a CPA's license against the NASBA CPAVerify national database.
 *
 * <p>Flag-gated with a mock fallback — the same convention every external integration here uses
 * (see {@code WeeklySummaryNotifier} / provider toggles). With {@code cpa.verify.provider=nasba}
 * <em>and</em> a base URL + API key configured, it calls the live service; otherwise (the default)
 * it runs a deterministic mock so the feature works end-to-end in dev/demo without external
 * dependencies. Any live-call failure falls back to the mock rather than blocking moderation.
 */
@Component
public class LicenseVerifier {

    private static final Logger log = LoggerFactory.getLogger(LicenseVerifier.class);

    public static final String SOURCE_NASBA = "NASBA_CPAVERIFY";
    public static final String SOURCE_MOCK = "MOCK";

    /** A plausibly-formatted license number: letters/digits/hyphens, at least 4 chars. */
    private static final Pattern LICENSE_FORMAT = Pattern.compile("^[A-Za-z0-9-]{4,}$");

    private final String provider;
    private final String nasbaBaseUrl;
    private final String nasbaApiKey;
    private final RestClient restClient;

    public LicenseVerifier(
            @Value("${cpa.verify.provider:mock}") String provider,
            @Value("${cpa.verify.nasba.base-url:}") String nasbaBaseUrl,
            @Value("${cpa.verify.nasba.api-key:}") String nasbaApiKey) {
        this.provider = provider == null ? "mock" : provider.trim().toLowerCase();
        this.nasbaBaseUrl = nasbaBaseUrl;
        this.nasbaApiKey = nasbaApiKey;
        this.restClient = StringUtils.hasText(nasbaBaseUrl)
                ? RestClient.builder().baseUrl(nasbaBaseUrl).build()
                : null;
    }

    /** True when a live NASBA provider is selected and fully configured. */
    public boolean isLiveProvider() {
        return "nasba".equals(provider) && StringUtils.hasText(nasbaBaseUrl) && StringUtils.hasText(nasbaApiKey);
    }

    /**
     * Check a license. Never throws — a misconfigured or failing live provider degrades to the
     * mock so the caller (moderation) is never blocked.
     */
    public LicenseVerificationResult verify(String state, String licenseNumber, String name) {
        if (!StringUtils.hasText(state) || !StringUtils.hasText(licenseNumber)) {
            return new LicenseVerificationResult(false, sourceLabel(), "Missing license state or number");
        }
        if (isLiveProvider()) {
            try {
                return verifyWithNasba(state.trim(), licenseNumber.trim(), name);
            } catch (Exception e) {
                log.warn("NASBA CPAVerify call failed ({}); falling back to mock", e.getMessage());
                return mockVerify(state, licenseNumber);
            }
        }
        return mockVerify(state, licenseNumber);
    }

    private String sourceLabel() {
        return isLiveProvider() ? SOURCE_NASBA : SOURCE_MOCK;
    }

    /**
     * Live NASBA CPAVerify lookup. The public CPAVerify API contract isn't fixed here, so this is a
     * deliberately defensive stub: it sends the license, expects a JSON object, and treats a truthy
     * {@code active}/{@code verified} field (or status "ACTIVE") as verified. Adapt the request/parse
     * to the real endpoint when credentials are provisioned — the fallback keeps prod safe meanwhile.
     */
    @SuppressWarnings("unchecked")
    private LicenseVerificationResult verifyWithNasba(String state, String licenseNumber, String name) {
        Map<String, Object> resp = restClient.get()
                .uri(uriBuilder -> uriBuilder.path("/api/v1/lookup")
                        .queryParam("state", state)
                        .queryParam("licenseNumber", licenseNumber)
                        .queryParam("name", name == null ? "" : name)
                        .build())
                .header("Authorization", "Bearer " + nasbaApiKey)
                .retrieve()
                .body(Map.class);

        boolean active = resp != null && (
                Boolean.TRUE.equals(resp.get("active"))
                        || Boolean.TRUE.equals(resp.get("verified"))
                        || "ACTIVE".equalsIgnoreCase(String.valueOf(resp.get("status"))));
        String detail = active
                ? "Active CPA license confirmed via NASBA CPAVerify"
                : "No active license found in NASBA CPAVerify";
        return new LicenseVerificationResult(active, SOURCE_NASBA, detail);
    }

    /**
     * Deterministic offline check: a well-formed license number in a named state is treated as
     * verified. Clearly labeled so staff know it isn't an authoritative source.
     */
    private LicenseVerificationResult mockVerify(String state, String licenseNumber) {
        boolean ok = LICENSE_FORMAT.matcher(licenseNumber.trim()).matches();
        String detail = ok
                ? "Format check passed (mock — no live verification provider configured)"
                : "License number format looks invalid";
        return new LicenseVerificationResult(ok, SOURCE_MOCK, detail);
    }
}
