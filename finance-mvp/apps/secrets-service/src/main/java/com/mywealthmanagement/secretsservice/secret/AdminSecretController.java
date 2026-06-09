package com.mywealthmanagement.secretsservice.secret;

import com.mywealthmanagement.secretsservice.secret.Dtos.SecretMetadata;
import com.mywealthmanagement.secretsservice.secret.Dtos.SecretWriteRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Operator API (ADMIN JWT, enforced in SecurityConfig). Create, rotate, list, delete.
 * Returns metadata only — never secret values.
 */
@RestController
@RequestMapping("/admin/secrets")
@RequiredArgsConstructor
public class AdminSecretController {

    private final SecretService service;
    private final AuditClient audit;

    /** Create a secret or add a new version (rotate). */
    @PostMapping
    public ResponseEntity<SecretMetadata> upsert(@RequestBody SecretWriteRequest req) {
        boolean existed = service.exists(req.name());
        SecretMetadata md = service.upsert(req);
        audit.record(existed ? "secret.rotate" : "secret.write", "SUCCESS", actor(),
                "name=" + req.name() + ";scope=" + md.scope() + ";version=" + md.activeVersion());
        return ResponseEntity.ok(md);
    }

    /** Rotate by name (value supplied in body). */
    @PostMapping("/{name}/rotate")
    public ResponseEntity<SecretMetadata> rotate(@PathVariable String name, @RequestBody SecretWriteRequest req) {
        SecretMetadata md = service.upsert(new SecretWriteRequest(name, req.scope(), req.description(),
                req.rotationDays(), req.value()));
        audit.record("secret.rotate", "SUCCESS", actor(), "name=" + name + ";version=" + md.activeVersion());
        return ResponseEntity.ok(md);
    }

    /** Metadata listing — values are never returned. */
    @GetMapping
    public List<SecretMetadata> list() {
        return service.listMetadata();
    }

    private static String actor() {
        var a = SecurityContextHolder.getContext().getAuthentication();
        return a != null ? String.valueOf(a.getName()) : "unknown";
    }
}
