package com.mywealthmanagement.accountaggregationservice.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plaid.client.model.JWKPublicKey;
import com.plaid.client.model.WebhookVerificationKeyGetRequest;
import com.plaid.client.model.WebhookVerificationKeyGetResponse;
import com.plaid.client.request.PlaidApi;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Verifies incoming Plaid webhooks. Plaid signs each webhook with an ES256 JWT in the
 * {@code Plaid-Verification} header; the JWT's {@code kid} identifies a rotating public
 * key fetched from {@code /webhook_verification_key/get}, and its
 * {@code request_body_sha256} claim must equal SHA-256 of the raw body.
 * <p>
 * Full verification (signature + body hash + freshness) runs when
 * {@code PLAID_WEBHOOK_VERIFY=true}; it is OFF by default so the dev/sandbox flow is
 * unaffected. Fails CLOSED: any missing/invalid signature, body mismatch, or stale token
 * is rejected.
 */
@Component
public class PlaidWebhookVerifier {

    private static final Logger log = LoggerFactory.getLogger(PlaidWebhookVerifier.class);
    private static final Duration MAX_AGE = Duration.ofMinutes(5); // replay window

    private final boolean verificationEnabled;
    private final PlaidApi plaidApi;
    private final ObjectMapper mapper = new ObjectMapper();
    // kid -> public key. Plaid's keys rotate but are stable enough to cache per process.
    private final ConcurrentHashMap<String, ECPublicKey> keyCache = new ConcurrentHashMap<>();

    public PlaidWebhookVerifier(@Value("${plaid.webhook.verify:false}") boolean verificationEnabled,
                                PlaidApi plaidApi) {
        this.verificationEnabled = verificationEnabled;
        this.plaidApi = plaidApi;
    }

    /** @return true if the webhook is authentic and should be processed. */
    public boolean verify(String rawBody, String verificationHeader) {
        if (!verificationEnabled) {
            log.debug("Plaid webhook verification disabled (dev/sandbox); accepting.");
            return true;
        }
        if (verificationHeader == null || verificationHeader.isBlank()) {
            log.warn("Rejected Plaid webhook: missing Plaid-Verification header.");
            return false;
        }
        try {
            String kid = kidFromHeader(verificationHeader);
            if (kid == null) {
                log.warn("Rejected Plaid webhook: no kid in verification JWT header.");
                return false;
            }
            ECPublicKey key = keyCache.computeIfAbsent(kid, this::fetchKey);
            if (key == null) {
                log.warn("Rejected Plaid webhook: could not resolve verification key for kid.");
                return false;
            }

            // Verifies the ES256 signature (throws if invalid) and gives us the claims.
            Jws<Claims> jws = Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(verificationHeader);
            Claims claims = jws.getBody();

            // Freshness: reject stale tokens (replay protection).
            if (claims.getIssuedAt() == null
                    || claims.getIssuedAt().toInstant().isBefore(Instant.now().minus(MAX_AGE))) {
                log.warn("Rejected Plaid webhook: verification token is stale.");
                return false;
            }

            // Body integrity: the signed hash must match the actual body.
            String claimed = claims.get("request_body_sha256", String.class);
            String actual = sha256Hex(rawBody == null ? "" : rawBody);
            if (claimed == null || !MessageDigest.isEqual(
                    claimed.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8))) {
                log.warn("Rejected Plaid webhook: body hash mismatch.");
                return false;
            }
            return true;
        } catch (Exception e) {
            log.warn("Rejected Plaid webhook: verification failed ({}).", e.getMessage());
            return false;
        }
    }

    /** Decode (unverified) the JWT header segment to read its {@code kid}. */
    private String kidFromHeader(String jwt) throws Exception {
        String[] parts = jwt.split("\\.");
        if (parts.length < 2) return null;
        String headerJson = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
        String kid = mapper.readTree(headerJson).path("kid").asText(null);
        return (kid == null || kid.isBlank()) ? null : kid;
    }

    /** Fetch the EC public key for a kid from Plaid and convert the JWK to an ECPublicKey. */
    private ECPublicKey fetchKey(String kid) {
        try {
            retrofit2.Response<WebhookVerificationKeyGetResponse> resp =
                    plaidApi.webhookVerificationKeyGet(new WebhookVerificationKeyGetRequest().keyId(kid)).execute();
            if (!resp.isSuccessful() || resp.body() == null) return null;
            JWKPublicKey jwk = resp.body().getKey();
            byte[] x = Base64.getUrlDecoder().decode(jwk.getX());
            byte[] y = Base64.getUrlDecoder().decode(jwk.getY());
            ECPoint point = new ECPoint(new BigInteger(1, x), new BigInteger(1, y));
            AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
            params.init(new ECGenParameterSpec("secp256r1")); // P-256
            ECParameterSpec ecSpec = params.getParameterSpec(ECParameterSpec.class);
            return (ECPublicKey) KeyFactory.getInstance("EC")
                    .generatePublic(new ECPublicKeySpec(point, ecSpec));
        } catch (Exception e) {
            log.warn("Plaid verification-key fetch failed for kid: {}", e.getMessage());
            return null;
        }
    }

    private static String sha256Hex(String body) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(body.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(hash);
    }
}
