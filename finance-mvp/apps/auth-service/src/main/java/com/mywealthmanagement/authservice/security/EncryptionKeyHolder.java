package com.mywealthmanagement.authservice.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Holds the AES key used to encrypt sensitive PII (SSN/EIN) at rest, derived once at
 * startup from {@code app.encryption.key} ({@code APP_ENCRYPTION_KEY}). Exposed via a
 * static accessor so the Hibernate-instantiated {@link EncryptedStringConverter} can
 * reach it. If unset, a clearly-labelled dev-only key is used and a warning logged;
 * production MUST set {@code APP_ENCRYPTION_KEY}.
 */
@Component
public class EncryptionKeyHolder {

    private static final Logger log = LoggerFactory.getLogger(EncryptionKeyHolder.class);
    private static final String DEV_FALLBACK = "dev-only-insecure-pii-key-change-me";

    private static volatile SecretKeySpec key;

    public EncryptionKeyHolder(@Value("${app.encryption.key:}") String configuredKey) {
        String material = configuredKey;
        if (material == null || material.isBlank()) {
            log.warn("APP_ENCRYPTION_KEY is not set — using an INSECURE dev-only key for PII "
                    + "encryption (SSN/EIN). Set APP_ENCRYPTION_KEY in production.");
            material = DEV_FALLBACK;
        }
        key = deriveKey(material);
    }

    static SecretKeySpec key() {
        return key;
    }

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
