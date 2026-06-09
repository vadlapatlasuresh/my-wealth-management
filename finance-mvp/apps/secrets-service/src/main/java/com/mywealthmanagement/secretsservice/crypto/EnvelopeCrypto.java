package com.mywealthmanagement.secretsservice.crypto;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Envelope encryption.
 *
 * Tiers:
 *   - KEK : the root key, behind {@link MasterKeyProvider} (local AES or GCP KMS). Wraps DEKs.
 *           The KEK is never held here — wrap/unwrap is delegated to the provider.
 *   - DEK : a per-version 256-bit AES key generated here. Encrypts the secret value.
 *
 * Value ciphertext layout is Base64( IV(12) ‖ ct ‖ GCMtag(16) ), matching the existing
 * EncryptedStringConverter/AccessTokenConverter. To read a secret: provider.unwrap(wrappedDek)
 * → DEK, then decrypt the ciphertext. Rotating the KEK (KMS) only re-wraps DEKs.
 */
@Component
@RequiredArgsConstructor
public class EnvelopeCrypto {

    private static final String ALGO = "AES/GCM/NoPadding";
    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RNG = new SecureRandom();

    private final MasterKeyProvider masterKey;

    /** A freshly generated DEK plus its KEK-wrapped form for storage. */
    public record SealedDek(SecretKey dek, String wrapped) {}

    /** Generate a new DEK and wrap it under the active KEK (via the provider). */
    public SealedDek newDek() {
        try {
            KeyGenerator kg = KeyGenerator.getInstance("AES");
            kg.init(256);
            SecretKey dek = kg.generateKey();
            return new SealedDek(dek, masterKey.wrap(dek.getEncoded()));
        } catch (Exception e) {
            throw new IllegalStateException("DEK generation failed", e);
        }
    }

    /** Recover a DEK from its stored wrapped form (via the provider). */
    public SecretKey unwrapDek(String wrapped) {
        return new SecretKeySpec(masterKey.unwrap(wrapped), "AES");
    }

    /** Encrypt a secret value with the given DEK. */
    public String encryptValue(SecretKey dek, String plaintext) {
        return gcmEncrypt(dek, plaintext.getBytes(StandardCharsets.UTF_8));
    }

    /** Decrypt a secret value with the given DEK. */
    public String decryptValue(SecretKey dek, String ciphertext) {
        return new String(gcmDecrypt(dek, ciphertext), StandardCharsets.UTF_8);
    }

    // ---- low-level AES-256-GCM for the value layer -----------------------------
    private static String gcmEncrypt(SecretKey key, byte[] plaintext) {
        try {
            byte[] iv = new byte[IV_LEN];
            RNG.nextBytes(iv);
            Cipher c = Cipher.getInstance(ALGO);
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = c.doFinal(plaintext);
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + ct.length)
                    .put(iv).put(ct).array());
        } catch (Exception e) {
            throw new IllegalStateException("encrypt failed", e);
        }
    }

    private static byte[] gcmDecrypt(SecretKey key, String b64) {
        try {
            byte[] all = Base64.getDecoder().decode(b64);
            ByteBuffer bb = ByteBuffer.wrap(all);
            byte[] iv = new byte[IV_LEN];
            bb.get(iv);
            byte[] ct = new byte[bb.remaining()];
            bb.get(ct);
            Cipher c = Cipher.getInstance(ALGO);
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return c.doFinal(ct);
        } catch (Exception e) {
            throw new IllegalStateException("decrypt failed", e);
        }
    }
}
