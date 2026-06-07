package com.mywealthmanagement.notificationservice.notification;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Internal, service-to-service endpoint for creating an in-app notification for a given
 * user. Guarded by a shared {@code X-Internal-Key} header (the audit-service pattern):
 * other services (e.g. real-estate-service when an investor expresses interest) post here
 * to notify a user who is not the caller.
 */
@RestController
@RequestMapping("/api/v1/notifications/internal")
public class InternalNotificationController {

    @Value("${notifications.internal.key:}")
    private String internalKey;

    private final NotificationRepository repository;

    public InternalNotificationController(NotificationRepository repository) {
        this.repository = repository;
    }

    @PostMapping
    public ResponseEntity<Void> ingest(@RequestBody Map<String, Object> body,
                                       @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        // Enforce the shared key when one is configured (always set in production).
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        Object userId = body.get("userId");
        if (userId == null) {
            return ResponseEntity.badRequest().build();
        }

        Notification n = new Notification();
        n.setUserId(Long.valueOf(userId.toString()));
        n.setType(str(body.get("type"), "SYSTEM"));
        n.setTitle(str(body.get("title"), "Notification"));
        n.setBody(str(body.get("body"), ""));
        n.setChannel("INAPP");
        n.setReadFlag(false);
        repository.save(n);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    private String str(Object o, String fallback) {
        return o == null ? fallback : o.toString();
    }
}
