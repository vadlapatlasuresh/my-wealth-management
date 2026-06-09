package com.mywealthmanagement.secretsservice.crypto;

import javax.crypto.SecretKey;

/**
 * Supplies the root Key-Encryption-Key (KEK) used to wrap/unwrap data-encryption keys.
 *
 * This is the "secret zero" seam. There are two implementations:
 *   - {@link LocalMasterKeyProvider}: derives the KEK from SECRETS_MASTER_KEY (dev / fallback).
 *   - (prod) a GCP KMS-backed provider where the KEK never leaves KMS and unwrap is a
 *     remote Decrypt call authorized by the VM's service-account identity — so no key
 *     material is ever stored in env or on disk. See SECRET_MANAGEMENT_DESIGN.md §2-4.
 *
 * The rest of the service depends only on this interface, so swapping local→KMS is a
 * one-class change with no impact on the data model or APIs.
 */
public interface MasterKeyProvider {
    /** The active KEK (AES-256). */
    SecretKey kek();

    /** Identifier of the active KEK (for audit + future key-version tracking). */
    String keyId();
}
