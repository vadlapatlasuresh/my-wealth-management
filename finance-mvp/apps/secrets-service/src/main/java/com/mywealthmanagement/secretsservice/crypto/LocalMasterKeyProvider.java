package com.mywealthmanagement.secretsservice.crypto;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Local KEK provider: derives a 256-bit AES key from SECRETS_MASTER_KEY via SHA-256
 * (same derivation style as the existing EncryptionKeyHolder in auth-service).
 *
 * Use for local dev and as a fallback. In production, replace with a GCP KMS-backed
 * provider so the KEK is never present as an env value (see SECRET_MANAGEMENT_DESIGN.md).
 */
@Component
public class LocalMasterKeyProvider implements MasterKeyProvider {

    private static final Logger log = LoggerFactory.getLogger(LocalMasterKeyProvider.class);
    private static final String DEV_FALLBACK = "dev-only-insecure-secrets-master-key-change-me";

    private final SecretKey kek;

    public LocalMasterKeyProvider(@Value("${secrets.master-key:}") String material) {
        String m = (material == null || material.isBlank()) ? DEV_FALLBACK : material;
        if (DEV_FALLBACK.equals(m)) {
            log.warn("SECRETS_MASTER_KEY is not set — using an INSECURE dev-only KEK. "
                    + "Set SECRETS_MASTER_KEY (or wire GCP KMS) in production.");
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(m.getBytes(StandardCharsets.UTF_8));
            this.kek = new SecretKeySpec(digest, "AES");
        } catch (Exception e) {
            throw new IllegalStateException("Cannot derive KEK", e);
        }
    }

    @Override
    public SecretKey kek() {
        return kek;
    }

    @Override
    public String keyId() {
        return "local-sha256-v1";
    }
}
