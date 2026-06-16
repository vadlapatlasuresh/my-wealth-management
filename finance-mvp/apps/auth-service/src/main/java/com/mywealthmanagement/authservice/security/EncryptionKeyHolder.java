package com.mywealthmanagement.authservice.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;

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

    public EncryptionKeyHolder(@Value("${app.encryption.key:}") String configuredKey, Environment environment) {
        boolean nonProd = isNonProd(environment);
        String material = configuredKey;
        if (material == null || material.isBlank()) {
            if (!nonProd) {
                throw new IllegalStateException("FATAL: APP_ENCRYPTION_KEY is not set — it is required in "
                        + "production to encrypt PII (SSN/EIN) at rest.");
            }
            log.warn("APP_ENCRYPTION_KEY is not set — using an INSECURE dev-only key for PII "
                    + "encryption (SSN/EIN). Set APP_ENCRYPTION_KEY in production.");
            material = DEV_FALLBACK;
        } else if (!nonProd && (DEV_FALLBACK.equals(material) || material.length() < 16)) {
            throw new IllegalStateException("FATAL: APP_ENCRYPTION_KEY is the dev default or too weak ("
                    + material.length() + " chars) — set a strong, unique key in production.");
        }
        key = deriveKey(material);
    }

    /** dev/test/local profiles tolerate the insecure fallback; everything else is treated as prod. */
    private static boolean isNonProd(Environment environment) {
        return Arrays.stream(environment.getActiveProfiles())
                .anyMatch(p -> p.equalsIgnoreCase("dev") || p.equalsIgnoreCase("test") || p.equalsIgnoreCase("local"));
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
