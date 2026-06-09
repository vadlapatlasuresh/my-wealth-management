package com.mywealthmanagement.secretsservice.secret;

import com.mywealthmanagement.secretsservice.crypto.EnvelopeCrypto;
import com.mywealthmanagement.secretsservice.secret.Dtos.SecretMetadata;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.*;

/**
 * Core secret lifecycle: create, rotate (new version), read (decrypt), list metadata,
 * and grant-based authorization. All reads/writes are audited by the callers.
 */
@Service
@RequiredArgsConstructor
public class SecretService {

    public static final String ACTIVE = "ACTIVE";
    public static final String PREVIOUS = "PREVIOUS";
    public static final String RETIRED = "RETIRED";

    private final SecretRepository secrets;
    private final SecretVersionRepository versions;
    private final SecretGrantRepository grants;
    private final EnvelopeCrypto crypto;

    // ---- authorization --------------------------------------------------------
    public boolean canRead(String principal, String scope) {
        return grants.existsByPrincipalAndScopeAndPermission(principal, scope, "READ");
    }

    // ---- write / rotate -------------------------------------------------------
    /** Create the secret if missing, then append a new ACTIVE version (prior → PREVIOUS). */
    @Transactional
    public SecretMetadata upsert(Dtos.SecretWriteRequest req) {
        if (req.name() == null || req.name().isBlank()) throw new IllegalArgumentException("name required");
        if (req.value() == null) throw new IllegalArgumentException("value required");

        Secret s = secrets.findByName(req.name()).orElseGet(() -> {
            Secret n = new Secret();
            n.setName(req.name());
            n.setScope(req.scope() != null ? req.scope() : scopeFromName(req.name()));
            n.setDescription(req.description());
            n.setRotationDays(req.rotationDays());
            n.setCreatedAt(Instant.now());
            n.setUpdatedAt(Instant.now());
            return secrets.save(n);
        });
        if (req.description() != null) s.setDescription(req.description());
        if (req.rotationDays() != null) s.setRotationDays(req.rotationDays());
        s.setUpdatedAt(Instant.now());
        secrets.save(s);

        // demote current ACTIVE
        versions.findFirstBySecretIdAndStatusOrderByVersionDesc(s.getId(), ACTIVE)
                .ifPresent(prev -> { prev.setStatus(PREVIOUS); versions.save(prev); });

        int nextVersion = versions.findBySecretIdOrderByVersionDesc(s.getId())
                .stream().findFirst().map(v -> v.getVersion() + 1).orElse(1);

        EnvelopeCrypto.SealedDek sealed = crypto.newDek();
        SecretVersion v = new SecretVersion();
        v.setSecretId(s.getId());
        v.setVersion(nextVersion);
        v.setWrappedDek(sealed.wrapped());
        v.setCiphertext(crypto.encryptValue(sealed.dek(), req.value()));
        v.setStatus(ACTIVE);
        v.setCreatedAt(Instant.now());
        versions.save(v);

        return metadata(s);
    }

    // ---- read -----------------------------------------------------------------
    /** Decrypt the ACTIVE value for a single secret by name. */
    public Optional<String> readValue(String name) {
        return secrets.findByName(name).flatMap(s ->
                versions.findFirstBySecretIdAndStatusOrderByVersionDesc(s.getId(), ACTIVE)
                        .map(this::decrypt));
    }

    /** All ACTIVE {name: value} for a scope (for boot-time bulk fetch). */
    public Map<String, String> readScope(String scope) {
        Map<String, String> out = new LinkedHashMap<>();
        for (Secret s : secrets.findByScope(scope)) {
            versions.findFirstBySecretIdAndStatusOrderByVersionDesc(s.getId(), ACTIVE)
                    .ifPresent(v -> out.put(s.getName(), decrypt(v)));
        }
        return out;
    }

    private String decrypt(SecretVersion v) {
        SecretKey dek = crypto.unwrapDek(v.getWrappedDek());
        return crypto.decryptValue(dek, v.getCiphertext());
    }

    // ---- metadata (never values) ---------------------------------------------
    public List<SecretMetadata> listMetadata() {
        List<SecretMetadata> out = new ArrayList<>();
        for (Secret s : secrets.findAll()) out.add(metadata(s));
        out.sort(Comparator.comparing(SecretMetadata::name));
        return out;
    }

    private SecretMetadata metadata(Secret s) {
        var active = versions.findFirstBySecretIdAndStatusOrderByVersionDesc(s.getId(), ACTIVE);
        return new SecretMetadata(s.getName(), s.getScope(), s.getDescription(), s.getRotationDays(),
                active.map(SecretVersion::getVersion).orElse(null),
                active.isPresent() ? "SET" : "EMPTY", s.getUpdatedAt());
    }

    public boolean exists(String name) {
        return secrets.existsByName(name);
    }

    static String scopeFromName(String name) {
        int dot = name.indexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }
}
