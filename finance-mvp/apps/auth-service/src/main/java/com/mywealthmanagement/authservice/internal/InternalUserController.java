package com.mywealthmanagement.authservice.internal;

import com.mywealthmanagement.authservice.user.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Internal lookup so other services can resolve a user's email/name for notifications
 * (e.g. notification-service emailing a payment reminder). Server-to-server, guarded by
 * the shared X-Internal-Key. Never exposes the password or other PII.
 */
@RestController
@RequestMapping("/internal/users")
public class InternalUserController {

    private final UserRepository userRepository;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    public InternalUserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/{userId}/email")
    public ResponseEntity<Map<String, String>> email(@PathVariable Long userId,
                                                     @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        return userRepository.findById(userId)
                .map(u -> ResponseEntity.ok(Map.of(
                        "email", u.getEmail() == null ? "" : u.getEmail(),
                        "name", u.getName() == null ? "" : u.getName())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
