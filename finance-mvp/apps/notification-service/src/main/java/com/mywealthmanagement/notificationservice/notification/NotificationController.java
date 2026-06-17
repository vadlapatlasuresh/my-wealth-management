package com.mywealthmanagement.notificationservice.notification;

import com.mywealthmanagement.notificationservice.notification.dto.NotificationDto;
import com.mywealthmanagement.notificationservice.notification.dto.PreferenceDto;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationRepository notificationRepository;
    private final NotificationPreferenceRepository preferenceRepository;
    private final NotificationProvider notificationProvider;

    private Long currentUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    @GetMapping("")
    public ResponseEntity<Map<String, List<NotificationDto>>> list() {
        Long userId = currentUserId();
        // Bounded display list (newest-first) so the inbox can't trigger an unbounded fetch.
        List<NotificationDto> items = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, Limit.of(200))
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("items", items));
    }

    @GetMapping("/preferences")
    public ResponseEntity<PreferenceDto> getPreferences() {
        Long userId = currentUserId();
        NotificationPreference pref = preferenceRepository.findByUserId(userId)
                .orElseGet(() -> {
                    NotificationPreference p = new NotificationPreference(userId);
                    // defaults: all true except pushEnabled=false
                    p.setEmailEnabled(true);
                    p.setPushEnabled(false);
                    p.setWeeklySummary(true);
                    p.setBudgetAlerts(true);
                    p.setPaymentAlerts(true);
                    return preferenceRepository.save(p);
                });
        return ResponseEntity.ok(toDto(pref));
    }

    @PutMapping("/preferences")
    public ResponseEntity<PreferenceDto> updatePreferences(@RequestBody PreferenceDto body) {
        Long userId = currentUserId();
        NotificationPreference pref = preferenceRepository.findByUserId(userId)
                .orElseGet(() -> new NotificationPreference(userId));
        pref.setEmailEnabled(body.isEmailEnabled());
        pref.setPushEnabled(body.isPushEnabled());
        pref.setWeeklySummary(body.isWeeklySummary());
        pref.setBudgetAlerts(body.isBudgetAlerts());
        pref.setPaymentAlerts(body.isPaymentAlerts());
        NotificationPreference saved = preferenceRepository.save(pref);
        return ResponseEntity.ok(toDto(saved));
    }

    @PostMapping("/test")
    public ResponseEntity<NotificationDto> sendTest() {
        Long userId = currentUserId();
        notificationProvider.send(userId, "SYSTEM", "Test notification",
                "This is a test notification from notification-service.", "INAPP");
        // return the most recently created notification for this user
        Notification created = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "Failed to create test notification"));
        return ResponseEntity.ok(toDto(created));
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<NotificationDto> markRead(@PathVariable Long id) {
        Long userId = currentUserId();
        Notification notification = notificationRepository.findById(id)
                .filter(n -> n.getUserId().equals(userId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Notification not found"));
        notification.setReadFlag(true);
        Notification saved = notificationRepository.save(notification);
        return ResponseEntity.ok(toDto(saved));
    }

    private NotificationDto toDto(Notification n) {
        return new NotificationDto(
                n.getId(),
                n.getType(),
                n.getTitle(),
                n.getBody(),
                n.getChannel(),
                n.isReadFlag(),
                n.getCreatedAt()
        );
    }

    private PreferenceDto toDto(NotificationPreference p) {
        return new PreferenceDto(
                p.isEmailEnabled(),
                p.isPushEnabled(),
                p.isWeeklySummary(),
                p.isBudgetAlerts(),
                p.isPaymentAlerts()
        );
    }
}
