package com.mywealthmanagement.auditservice.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Holds the secret that keys the audit hash chain, from {@code audit.chain.key}
 * ({@code AUDIT_CHAIN_KEY}).
 *
 * WHY A KEY AT ALL: the original chain was {@code SHA-256(prev | content)} with no secret. That
 * detects a careless UPDATE, but not an attacker or an insider — anyone who can write to the audit
 * DB can rewrite a row AND recompute every subsequent hash, and the chain verifies clean. For a
 * financial audit trail that is the threat that matters. Keying the digest means forging history
 * needs DB write access *and* a secret that does not live in the DB.
 *
 * This is necessary but not sufficient: someone holding both can still rewrite the chain. That is
 * what the signed checkpoints are for (see {@link AuditCheckpointService}) — they pin the chain
 * head outside this database, so history before a checkpoint cannot be rewritten undetectably even
 * with the key.
 *
 * Mirrors auth-service's EncryptionKeyHolder: a loud dev fallback, a hard failure in production.
 */
@Component
public class AuditChainKeyHolder {

    private static final Logger log = LoggerFactory.getLogger(AuditChainKeyHolder.class);
    private static final String DEV_FALLBACK = "dev-only-insecure-audit-chain-key-change-me";
    private static final int MIN_KEY_LENGTH = 16;

    private final byte[] key;

    public AuditChainKeyHolder(@Value("${audit.chain.key:}") String configuredKey, Environment environment) {
        boolean nonProd = isNonProd(environment);
        String material = configuredKey;
        if (material == null || material.isBlank()) {
            if (!nonProd) {
                throw new IllegalStateException("FATAL: AUDIT_CHAIN_KEY is not set — it is required in "
                        + "production to key the tamper-evident audit chain. Without it, anyone who can "
                        + "write to the audit database can rewrite history undetectably.");
            }
            log.warn("AUDIT_CHAIN_KEY is not set — using an INSECURE dev-only key for the audit hash "
                    + "chain. Set AUDIT_CHAIN_KEY in production.");
            material = DEV_FALLBACK;
        } else if (!nonProd && (DEV_FALLBACK.equals(material) || material.length() < MIN_KEY_LENGTH)) {
            throw new IllegalStateException("FATAL: AUDIT_CHAIN_KEY is the dev default or too weak ("
                    + material.length() + " chars) — set a strong, unique key in production.");
        }
        this.key = material.getBytes(StandardCharsets.UTF_8);
    }

    byte[] key() {
        return key;
    }

    private static boolean isNonProd(Environment environment) {
        String[] profiles = environment.getActiveProfiles().length > 0
                ? environment.getActiveProfiles() : environment.getDefaultProfiles();
        return Arrays.stream(profiles).anyMatch(p -> p.equalsIgnoreCase("dev") || p.equalsIgnoreCase("test"));
    }
}
