package com.mywealthmanagement.accountaggregationservice.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Holds the AES key used to encrypt Plaid access tokens at rest, derived once at
 * startup from {@code app.encryption.key} ({@code APP_ENCRYPTION_KEY} in the
 * environment). The key is exposed via a static accessor so the JPA
 * {@link AccessTokenConverter} — which is instantiated by Hibernate, not Spring —
 * can reach it without fragile container wiring.
 * <p>
 * If no key is configured, a clearly-labelled dev-only key is derived so local H2
 * development keeps working, and a warning is logged. Production MUST set
 * {@code APP_ENCRYPTION_KEY}.
 */
@Component
public class EncryptionKeyHolder {

    private static final Logger log = LoggerFactory.getLogger(EncryptionKeyHolder.class);
    private static final String DEV_FALLBACK = "dev-only-insecure-plaid-token-key-change-me";

    private static volatile SecretKeySpec key;

    public EncryptionKeyHolder(@Value("${app.encryption.key:}") String configuredKey) {
        String material = configuredKey;
        if (material == null || material.isBlank()) {
            log.warn("APP_ENCRYPTION_KEY is not set — using an INSECURE dev-only key for Plaid token "
                    + "encryption. Set APP_ENCRYPTION_KEY in production.");
            material = DEV_FALLBACK;
        }
        key = deriveKey(material);
    }

    static SecretKeySpec key() {
        return key;
    }

    /** Derive a 256-bit AES key from arbitrary-length key material via SHA-256. */
    private static SecretKeySpec deriveKey(String material) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(material.getBytes(StandardCharsets.UTF_8));
            return new SecretKeySpec(digest, "AES");
        } catch (Exception e) {
            throw new IllegalStateException("Unable to derive encryption key", e);
        }
    }
}
