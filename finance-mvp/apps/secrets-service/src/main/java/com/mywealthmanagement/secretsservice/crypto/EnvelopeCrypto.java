package com.mywealthmanagement.secretsservice.crypto;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Envelope encryption.
 *
 * Tiers:
 *   - KEK  : the root key (from {@link MasterKeyProvider}; KMS in prod). Wraps DEKs.
 *   - DEK  : a per-version 256-bit AES key generated here. Encrypts the secret value.
 *
 * On-disk layout for both wrapped DEKs and ciphertext is Base64( IV(12) ‖ ct ‖ GCMtag(16) ),
 * matching the existing EncryptedStringConverter/AccessTokenConverter in the codebase.
 *
 * To read a secret: unwrap the stored DEK with the KEK, then decrypt the ciphertext with
 * the DEK. Rotating the KEK only requires re-wrapping DEKs, never re-encrypting values.
 */
@Component
@RequiredArgsConstructor
public class EnvelopeCrypto {

    private static final String ALGO = "AES/GCM/NoPadding";
    private static final int IV_LEN = 12;       // 96-bit nonce
    private static final int TAG_BITS = 128;    // 128-bit auth tag
    private static final SecureRandom RNG = new SecureRandom();

    private final MasterKeyProvider masterKey;

    /** A freshly generated DEK plus its KEK-wrapped form for storage. */
    public record SealedDek(SecretKey dek, String wrapped) {}

    /** Generate a new DEK and wrap it under the active KEK. */
    public SealedDek newDek() {
        try {
            KeyGenerator kg = KeyGenerator.getInstance("AES");
            kg.init(256);
            SecretKey dek = kg.generateKey();
            String wrapped = gcmEncrypt(masterKey.kek(), dek.getEncoded());
            return new SealedDek(dek, wrapped);
        } catch (Exception e) {
            throw new IllegalStateException("DEK generation failed", e);
        }
    }

    /** Recover a DEK from its stored wrapped form using the active KEK. */
    public SecretKey unwrapDek(String wrapped) {
        byte[] raw = gcmDecrypt(masterKey.kek(), wrapped);
        return new SecretKeySpec(raw, "AES");
    }

    /** Encrypt a secret value with the given DEK. */
    public String encryptValue(SecretKey dek, String plaintext) {
        return gcmEncrypt(dek, plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    /** Decrypt a secret value with the given DEK. */
    public String decryptValue(SecretKey dek, String ciphertext) {
        return new String(gcmDecrypt(dek, ciphertext), java.nio.charset.StandardCharsets.UTF_8);
    }

    // ---- low-level AES-256-GCM -------------------------------------------------
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
