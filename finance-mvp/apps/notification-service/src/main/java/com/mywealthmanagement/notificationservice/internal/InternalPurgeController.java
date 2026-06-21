package com.mywealthmanagement.notificationservice.internal;

import com.mywealthmanagement.notificationservice.notification.DeviceTokenRepository;
import com.mywealthmanagement.notificationservice.notification.NotificationPreferenceRepository;
import com.mywealthmanagement.notificationservice.notification.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Purges notifications + preferences for a user on account deletion. */
@RestController
@RequestMapping("/internal/users")
@RequiredArgsConstructor
public class InternalPurgeController {

    private final NotificationRepository notificationRepository;
    private final NotificationPreferenceRepository notificationPreferenceRepository;
    private final DeviceTokenRepository deviceTokenRepository;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    @DeleteMapping("/{userId}")
    @Transactional
    public ResponseEntity<Void> purge(@PathVariable Long userId,
                                      @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        notificationRepository.deleteByUserId(userId);
        notificationPreferenceRepository.deleteByUserId(userId);
        deviceTokenRepository.deleteByUserId(userId);
        return ResponseEntity.noContent().build();
    }
}
