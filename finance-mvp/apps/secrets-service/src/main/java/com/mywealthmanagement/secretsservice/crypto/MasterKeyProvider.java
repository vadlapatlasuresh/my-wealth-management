package com.mywealthmanagement.secretsservice.crypto;

/**
 * Wraps/unwraps data-encryption keys (DEKs) under a root key (KEK). This is the
 * "secret zero" seam — the KEK itself is never returned to the application.
 *
 * Implementations:
 *   - {@link LocalMasterKeyProvider}: KEK derived from SECRETS_MASTER_KEY; wrap/unwrap
 *     is local AES-256-GCM. For dev / single-host without KMS. (default)
 *   - {@link GcpKmsMasterKeyProvider}: KEK lives in GCP KMS and never leaves it; wrap is
 *     KMS Encrypt and unwrap is KMS Decrypt, authorized by the VM's service-account
 *     identity (no key material in env or on disk). Selected with secrets.provider=kms.
 *
 * `wrapped` strings are opaque and provider-specific; the same provider that wrapped a
 * DEK must unwrap it (switching providers requires a re-wrap migration).
 */
public interface MasterKeyProvider {
    /** Wrap raw DEK bytes; returns an opaque, storable string (e.g. Base64 ciphertext). */
    String wrap(byte[] dek);

    /** Recover raw DEK bytes from a previously wrapped string. */
    byte[] unwrap(String wrapped);

    /** Identifier of the active KEK (for audit + future key-version tracking). */
    String keyId();
}
