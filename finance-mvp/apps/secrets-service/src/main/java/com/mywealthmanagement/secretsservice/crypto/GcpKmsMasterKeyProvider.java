package com.mywealthmanagement.secretsservice.crypto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * GCP KMS-backed KEK (selected with secrets.provider=kms). The root key lives in Cloud
 * KMS and never leaves it: wrap is KMS Encrypt and unwrap is KMS Decrypt.
 *
 * Auth uses the GCE metadata server — the VM's attached service-account access token —
 * so there is NO key file, JSON credential, or env secret. The machine's IAM identity
 * (granted roles/cloudkms.cryptoKeyEncrypterDecrypter on this key) is the only credential,
 * and it cannot be copied out of a config file. This is what removes the last secret
 * ("secret zero") from the environment.
 *
 * Config:
 *   secrets.provider=kms
 *   secrets.kms.key-name=projects/P/locations/L/keyRings/R/cryptoKeys/K
 *   secrets.kms.token-uri    (default: GCE metadata endpoint; override for testing)
 *   secrets.kms.endpoint     (default: https://cloudkms.googleapis.com)
 *
 * No extra Maven dependencies — uses java.net.http + Jackson (already on the classpath).
 */
@Component
@ConditionalOnProperty(name = "secrets.provider", havingValue = "kms")
public class GcpKmsMasterKeyProvider implements MasterKeyProvider {

    private static final Logger log = LoggerFactory.getLogger(GcpKmsMasterKeyProvider.class);
    private static final String METADATA_TOKEN_URI =
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

    private final String keyName;
    private final String endpoint;
    private final String tokenUri;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper mapper = new ObjectMapper();

    // cached access token
    private volatile String cachedToken;
    private volatile Instant tokenExpiry = Instant.EPOCH;

    public GcpKmsMasterKeyProvider(
            @Value("${secrets.kms.key-name:}") String keyName,
            @Value("${secrets.kms.endpoint:https://cloudkms.googleapis.com}") String endpoint,
            @Value("${secrets.kms.token-uri:" + METADATA_TOKEN_URI + "}") String tokenUri) {
        if (keyName == null || keyName.isBlank()) {
            throw new IllegalStateException("secrets.provider=kms requires secrets.kms.key-name "
                    + "(projects/P/locations/L/keyRings/R/cryptoKeys/K)");
        }
        this.keyName = keyName;
        this.endpoint = endpoint;
        this.tokenUri = tokenUri;
        log.info("KMS key wrapping enabled for {}", keyName);
    }

    @Override
    public String wrap(byte[] dek) {
        JsonNode r = call(keyName + ":encrypt",
                "{\"plaintext\":\"" + Base64.getEncoder().encodeToString(dek) + "\"}");
        return r.path("ciphertext").asText(); // KMS returns standard-base64 ciphertext
    }

    @Override
    public byte[] unwrap(String wrapped) {
        JsonNode r = call(keyName + ":decrypt",
                "{\"ciphertext\":\"" + wrapped + "\"}");
        return Base64.getDecoder().decode(r.path("plaintext").asText());
    }

    @Override
    public String keyId() {
        return keyName;
    }

    private JsonNode call(String resource, String body) {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint + "/v1/" + resource))
                    .timeout(Duration.ofSeconds(10))
                    .header("Authorization", "Bearer " + accessToken())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                throw new IllegalStateException("KMS " + resource + " -> HTTP " + res.statusCode() + ": " + res.body());
            }
            return mapper.readTree(res.body());
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("KMS call failed: " + resource, e);
        }
    }

    /** Cached service-account access token from the GCE metadata server. */
    private String accessToken() {
        if (cachedToken != null && Instant.now().isBefore(tokenExpiry)) return cachedToken;
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(tokenUri))
                    .timeout(Duration.ofSeconds(5))
                    .header("Metadata-Flavor", "Google")
                    .GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                throw new IllegalStateException("metadata token -> HTTP " + res.statusCode());
            }
            JsonNode t = mapper.readTree(res.body());
            cachedToken = t.path("access_token").asText();
            long ttl = Math.max(60, t.path("expires_in").asLong(3600) - 60); // refresh 60s early
            tokenExpiry = Instant.now().plusSeconds(ttl);
            return cachedToken;
        } catch (Exception e) {
            throw new IllegalStateException("Could not obtain GCE service-account token", e);
        }
    }
}
