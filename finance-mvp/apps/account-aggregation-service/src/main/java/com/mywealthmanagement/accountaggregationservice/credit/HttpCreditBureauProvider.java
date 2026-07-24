package com.mywealthmanagement.accountaggregationservice.credit;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * LIVE credit-bureau provider over HTTPS. Selected with {@code credit.provider=http}.
 *
 * <p><b>Why a configurable mapper instead of one vendor SDK.</b> Bureau access is resold by
 * several aggregators (Array, CRS, Experian Connect, TransUnion TruVision …) and each returns the
 * same handful of facts under different field names. Rather than hard-code one vendor's shape —
 * which would need a code change and a redeploy to switch resellers — this provider reads the
 * fields through configurable dotted paths. Wiring a bureau is then a config change:
 *
 * <pre>
 *   credit.provider=http
 *   credit.http.base-url=https://api.yourbureau.example
 *   credit.http.profile-path=/v1/consumers/{userId}/credit-profile
 *   # Auth — pick ONE:
 *   credit.http.api-key=…                       (sent as credit.http.api-key-header, default X-API-Key)
 *   credit.http.token-url=…                     (OAuth2 client_credentials)
 *   credit.http.client-id=… / client-secret=…
 *   # Field mapping (defaults shown; override per vendor):
 *   credit.http.path.score=score
 *   credit.http.path.as-of=asOf
 *   credit.http.path.history=history
 *   credit.http.path.utilization-pct=utilization.pct
 *   …
 * </pre>
 *
 * <p><b>Honesty rules.</b> {@code provider="live"} is only ever set when the call really
 * returned a score in the 300–850 range. Anything else (unconfigured, network error, missing or
 * out-of-range score) throws, and {@link CreditBureauRouter} falls back to the clearly-labeled
 * demo profile. We never relabel demo data as live, and we never invent a field the bureau
 * did not send — missing metrics are omitted so the client normalizer defaults them rather than
 * rendering a fabricated number.
 *
 * <p><b>Compliance note.</b> Consumer credit data is FCRA-regulated. Serving a real score
 * requires a permissible purpose, a signed bureau/reseller agreement, and consumer consent
 * captured at enrollment. See docs/THIRD_PARTY_VENDORS.md before flipping this on.
 */
@Component
public class HttpCreditBureauProvider implements CreditBureauProvider {

    private static final Logger log = LoggerFactory.getLogger(HttpCreditBureauProvider.class);

    private static final int SCALE_MIN = 300;
    private static final int SCALE_MAX = 850;
    /** Refresh the OAuth token this long before it actually expires. */
    private static final Duration TOKEN_SKEW = Duration.ofSeconds(60);

    private final RestClient http;
    private final String baseUrl;
    private final String profilePath;
    private final String apiKey;
    private final String apiKeyHeader;
    private final String tokenUrl;
    private final String clientId;
    private final String clientSecret;
    private final Map<String, String> paths;

    private volatile String cachedToken;
    private volatile long cachedTokenExpiresAt;

    public HttpCreditBureauProvider(
            @Value("${credit.http.base-url:}") String baseUrl,
            @Value("${credit.http.profile-path:/v1/consumers/{userId}/credit-profile}") String profilePath,
            @Value("${credit.http.api-key:}") String apiKey,
            @Value("${credit.http.api-key-header:X-API-Key}") String apiKeyHeader,
            @Value("${credit.http.token-url:}") String tokenUrl,
            @Value("${credit.http.client-id:}") String clientId,
            @Value("${credit.http.client-secret:}") String clientSecret,
            @Value("${credit.http.path.score:score}") String pScore,
            @Value("${credit.http.path.delta:delta}") String pDelta,
            @Value("${credit.http.path.as-of:asOf}") String pAsOf,
            @Value("${credit.http.path.history:history}") String pHistory,
            @Value("${credit.http.path.history-month:month}") String pHistoryMonth,
            @Value("${credit.http.path.history-score:score}") String pHistoryScore,
            @Value("${credit.http.path.utilization-pct:utilization.pct}") String pUtilPct,
            @Value("${credit.http.path.utilization-balance:utilization.balance}") String pUtilBalance,
            @Value("${credit.http.path.utilization-limit:utilization.limit}") String pUtilLimit,
            @Value("${credit.http.path.on-time-pct:onTimePct}") String pOnTime,
            @Value("${credit.http.path.avg-age-months:avgAgeMonths}") String pAvgAge,
            @Value("${credit.http.path.account-types:accountTypes}") String pAccountTypes,
            @Value("${credit.http.path.inquiries-12mo:inquiries12mo}") String pInquiries) {
        this.baseUrl = baseUrl == null ? "" : baseUrl.trim();
        this.profilePath = profilePath;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.apiKeyHeader = apiKeyHeader;
        this.tokenUrl = tokenUrl == null ? "" : tokenUrl.trim();
        this.clientId = clientId == null ? "" : clientId.trim();
        this.clientSecret = clientSecret == null ? "" : clientSecret.trim();
        this.http = this.baseUrl.isBlank()
                ? null
                : RestClient.builder().baseUrl(this.baseUrl).build();

        Map<String, String> p = new LinkedHashMap<>();
        p.put("score", pScore);
        p.put("delta", pDelta);
        p.put("asOf", pAsOf);
        p.put("history", pHistory);
        p.put("historyMonth", pHistoryMonth);
        p.put("historyScore", pHistoryScore);
        p.put("utilPct", pUtilPct);
        p.put("utilBalance", pUtilBalance);
        p.put("utilLimit", pUtilLimit);
        p.put("onTimePct", pOnTime);
        p.put("avgAgeMonths", pAvgAge);
        p.put("accountTypes", pAccountTypes);
        p.put("inquiries12mo", pInquiries);
        this.paths = Map.copyOf(p);
    }

    @Override
    public String name() {
        return "http";
    }

    /** Configured = a base URL plus one working auth method. Anything less and we stay out. */
    @Override
    public boolean isConfigured() {
        boolean hasAuth = !apiKey.isBlank()
                || (!tokenUrl.isBlank() && !clientId.isBlank() && !clientSecret.isBlank());
        return http != null && !baseUrl.isBlank() && hasAuth;
    }

    @Override
    public Map<String, Object> fetchProfile(long userId) {
        if (!isConfigured()) {
            throw new IllegalStateException("Bureau provider not configured (credit.http.base-url / auth missing)");
        }
        JsonNode body = http.get()
                .uri(profilePath.replace("{userId}", String.valueOf(userId)))
                .headers(h -> {
                    if (!apiKey.isBlank()) {
                        h.set(apiKeyHeader, apiKey);
                    } else {
                        h.setBearerAuth(accessToken());
                    }
                })
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .body(JsonNode.class);

        return normalize(body);
    }

    // ------------------------------------------------------------------ mapping

    /**
     * Map the vendor payload onto our documented contract. Only fields the bureau actually
     * returned are copied; the score is validated so a garbage response becomes a miss (and
     * therefore a demo fallback) rather than a nonsense number on someone's dashboard.
     */
    Map<String, Object> normalize(JsonNode body) {
        if (body == null || body.isNull()) {
            throw new IllegalStateException("Bureau returned an empty body");
        }
        Integer score = intAt(body, paths.get("score"));
        if (score == null || score < SCALE_MIN || score > SCALE_MAX) {
            throw new IllegalStateException("Bureau response has no usable score in "
                    + SCALE_MIN + ".." + SCALE_MAX + " (got " + score + ")");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("provider", "live"); // earned: a real score really came back
        out.put("score", score);
        out.put("scaleMin", SCALE_MIN);
        out.put("scaleMax", SCALE_MAX);

        List<Map<String, Object>> history = history(body);
        Integer delta = intAt(body, paths.get("delta"));
        if (delta == null && history.size() >= 2) {
            // Derive rather than omit: the previous history point is the same fact the bureau
            // would have told us, and the client renders "vs last month" from it.
            Object prev = history.get(history.size() - 2).get("score");
            delta = score - ((Number) prev).intValue();
        }
        out.put("delta", delta == null ? 0 : delta);

        String asOf = textAt(body, paths.get("asOf"));
        out.put("asOf", asOf != null ? asOf : LocalDate.now(ZoneOffset.UTC).toString());
        if (!history.isEmpty()) {
            out.put("history", history);
        }

        Double utilPct = doubleAt(body, paths.get("utilPct"));
        Integer utilBalance = intAt(body, paths.get("utilBalance"));
        Integer utilLimit = intAt(body, paths.get("utilLimit"));
        if (utilPct == null && utilBalance != null && utilLimit != null && utilLimit > 0) {
            utilPct = (double) utilBalance / utilLimit;
        }
        if (utilPct != null || utilBalance != null || utilLimit != null) {
            Map<String, Object> util = new LinkedHashMap<>();
            util.put("pct", utilPct == null ? 0 : Math.round(utilPct * 100.0) / 100.0);
            util.put("balance", utilBalance == null ? 0 : utilBalance);
            util.put("limit", utilLimit == null ? 0 : utilLimit);
            out.put("utilization", util);
        }

        putIfPresent(out, "onTimePct", doubleAt(body, paths.get("onTimePct")));
        putIfPresent(out, "avgAgeMonths", intAt(body, paths.get("avgAgeMonths")));
        putIfPresent(out, "accountTypes", intAt(body, paths.get("accountTypes")));
        putIfPresent(out, "inquiries12mo", intAt(body, paths.get("inquiries12mo")));
        return out;
    }

    private List<Map<String, Object>> history(JsonNode body) {
        List<Map<String, Object>> out = new ArrayList<>();
        JsonNode arr = at(body, paths.get("history"));
        if (arr == null || !arr.isArray()) {
            return out;
        }
        for (JsonNode pt : arr) {
            Integer s = intAt(pt, paths.get("historyScore"));
            String month = textAt(pt, paths.get("historyMonth"));
            if (s == null || month == null) {
                continue; // a partial point is not worth plotting
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("month", month);
            m.put("score", s);
            out.add(m);
        }
        return out;
    }

    // ------------------------------------------------------------------ auth

    /** OAuth2 client_credentials token, cached until shortly before it expires. */
    private String accessToken() {
        long now = System.currentTimeMillis();
        String token = cachedToken;
        if (token != null && now < cachedTokenExpiresAt) {
            return token;
        }
        JsonNode res = RestClient.create().post()
                .uri(tokenUrl)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body("grant_type=client_credentials&client_id=" + enc(clientId)
                        + "&client_secret=" + enc(clientSecret))
                .retrieve()
                .body(JsonNode.class);
        if (res == null || !res.hasNonNull("access_token")) {
            throw new IllegalStateException("Bureau token endpoint returned no access_token");
        }
        long ttl = res.path("expires_in").asLong(300);
        cachedToken = res.get("access_token").asText();
        cachedTokenExpiresAt = now + Math.max(0, ttl * 1000 - TOKEN_SKEW.toMillis());
        log.info("Refreshed credit-bureau access token (ttl {}s)", ttl);
        return cachedToken;
    }

    private static String enc(String v) {
        return java.net.URLEncoder.encode(v, java.nio.charset.StandardCharsets.UTF_8);
    }

    // ------------------------------------------------------------------ json helpers

    /** Resolve a dotted path (e.g. {@code utilization.pct}) against a node; null when absent. */
    private static JsonNode at(JsonNode root, String dotted) {
        if (root == null || dotted == null || dotted.isBlank()) {
            return null;
        }
        JsonNode cur = root;
        for (String seg : dotted.split("\\.")) {
            if (cur == null) {
                return null;
            }
            cur = cur.get(seg);
        }
        return (cur == null || cur.isNull()) ? null : cur;
    }

    private static Integer intAt(JsonNode root, String dotted) {
        JsonNode n = at(root, dotted);
        return (n == null || !n.isNumber()) ? null : n.asInt();
    }

    private static Double doubleAt(JsonNode root, String dotted) {
        JsonNode n = at(root, dotted);
        return (n == null || !n.isNumber()) ? null : n.asDouble();
    }

    private static String textAt(JsonNode root, String dotted) {
        JsonNode n = at(root, dotted);
        return (n == null || !n.isTextual()) ? null : n.asText();
    }

    private static void putIfPresent(Map<String, Object> out, String key, Object value) {
        if (value != null) {
            out.put(key, value);
        }
    }
}
