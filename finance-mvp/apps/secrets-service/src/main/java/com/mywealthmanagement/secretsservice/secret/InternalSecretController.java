package com.mywealthmanagement.secretsservice.secret;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Internal read API for services. NOT routed publicly by the gateway.
 *
 * Interim identity (matches the existing X-Internal-Key pattern, but scoped):
 *   - X-Internal-Key : shared service-mesh key (network + shared-secret gate)
 *   - X-Service-Id   : the calling principal, e.g. "payment-service"
 * Authorization: the principal must hold a READ grant for the requested scope.
 *
 * Upgrade path (see SECRET_MANAGEMENT_DESIGN.md §6): replace these headers with a
 * short-lived signed service-JWT, then mTLS client-cert identity.
 */
@RestController
@RequestMapping("/internal/secrets")
@RequiredArgsConstructor
public class InternalSecretController {

    private final SecretService service;
    private final AuditClient audit;

    @Value("${secrets.internal.key:${SECRETS_INTERNAL_KEY:dev-internal-secrets-key}}")
    private String internalKey;

    /** Bulk read: all secrets in a scope the caller is granted, as {name: value}. */
    @GetMapping
    public Map<String, String> readScope(@RequestParam String scope,
                                         @RequestHeader(value = "X-Internal-Key", required = false) String key,
                                         @RequestHeader(value = "X-Service-Id", required = false) String principal) {
        authn(key);
        authz(principal, scope);
        Map<String, String> values = service.readScope(scope);
        audit.record("secret.read", "SUCCESS", principal, "scope=" + scope + ";count=" + values.size());
        return values;
    }

    /** Single secret by name. */
    @GetMapping("/{name}")
    public Map<String, String> readOne(@PathVariable String name,
                                       @RequestHeader(value = "X-Internal-Key", required = false) String key,
                                       @RequestHeader(value = "X-Service-Id", required = false) String principal) {
        authn(key);
        String scope = SecretService.scopeFromName(name);
        authz(principal, scope);
        String value = service.readValue(name)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "secret not found: " + name));
        audit.record("secret.read", "SUCCESS", principal, "name=" + name);
        return Map.of(name, value);
    }

    private void authn(String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid internal key");
        }
    }

    private void authz(String principal, String scope) {
        if (!StringUtils.hasText(principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "missing X-Service-Id");
        }
        if (!service.canRead(principal, scope)) {
            audit.record("secret.denied", "DENIED", principal, "scope=" + scope);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "principal '" + principal + "' has no READ grant for scope '" + scope + "'");
        }
    }
}
