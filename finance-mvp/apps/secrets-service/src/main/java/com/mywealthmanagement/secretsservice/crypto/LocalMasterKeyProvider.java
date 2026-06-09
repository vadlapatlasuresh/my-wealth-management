package com.mywealthmanagement.secretsservice.crypto;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Local KEK provider (default). Derives a 256-bit AES KEK from SECRETS_MASTER_KEY via
 * SHA-256 (same style as auth-service's EncryptionKeyHolder) and wraps/unwraps DEKs with
 * local AES-256-GCM. For dev / single-host. In production prefer secrets.provider=kms so
 * the KEK never exists as an env value (see GcpKmsMasterKeyProvider).
 */
@Component
@ConditionalOnProperty(name = "secrets.provider", havingValue = "local", matchIfMissing = true)
public class LocalMasterKeyProvider implements MasterKeyProvider {

    private static final Logger log = LoggerFactory.getLogger(LocalMasterKeyProvider.class);
    private static final String DEV_FALLBACK = "dev-only-insecure-secrets-master-key-change-me";
    private static final String ALGO = "AES/GCM/NoPadding";
    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RNG = new SecureRandom();

    private final SecretKey kek;

    public LocalMasterKeyProvider(@Value("${secrets.master-key:}") String material) {
        String m = (material == null || material.isBlank()) ? DEV_FALLBACK : material;
        if (DEV_FALLBACK.equals(m)) {
            log.warn("SECRETS_MASTER_KEY is not set — using an INSECURE dev-only KEK. "
                    + "Use secrets.provider=kms (GCP KMS) in production.");
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(m.getBytes(StandardCharsets.UTF_8));
            this.kek = new SecretKeySpec(digest, "AES");
        } catch (Exception e) {
            throw new IllegalStateException("Cannot derive KEK", e);
        }
    }

    @Override
    public String wrap(byte[] dek) {
        try {
            byte[] iv = new byte[IV_LEN];
            RNG.nextBytes(iv);
            Cipher c = Cipher.getInstance(ALGO);
            c.init(Cipher.ENCRYPT_MODE, kek, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = c.doFinal(dek);
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array());
        } catch (Exception e) {
            throw new IllegalStateException("DEK wrap failed", e);
        }
    }

    @Override
    public byte[] unwrap(String wrapped) {
        try {
            byte[] all = Base64.getDecoder().decode(wrapped);
            ByteBuffer bb = ByteBuffer.wrap(all);
            byte[] iv = new byte[IV_LEN];
            bb.get(iv);
            byte[] ct = new byte[bb.remaining()];
            bb.get(ct);
            Cipher c = Cipher.getInstance(ALGO);
            c.init(Cipher.DECRYPT_MODE, kek, new GCMParameterSpec(TAG_BITS, iv));
            return c.doFinal(ct);
        } catch (Exception e) {
            throw new IllegalStateException("DEK unwrap failed", e);
        }
    }

    @Override
    public String keyId() {
        return "local-sha256-v1";
    }
}
