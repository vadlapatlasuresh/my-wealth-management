package com.mywealthmanagement.authservice.household;

import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Opt-in sharing of personal resources with a household (Phase 3c).
 *
 * <pre>
 *   GET    /api/v1/household/shares            what OTHER members shared with me + what I share
 *   POST   /api/v1/household/shares            { resourceType, resourceId, label }  share mine
 *   DELETE /api/v1/household/shares/{id}       stop sharing (owner only)
 * </pre>
 *
 * The response carries only the registry: ids and labels of shared resources, never balances.
 * The client fetches the actual numbers from the owning service, so no financial value is ever
 * copied into auth-service.
 */
@RestController
@RequestMapping("/api/v1/household/shares")
@RequiredArgsConstructor
public class HouseholdShareController {

    private final HouseholdShareService shareService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(defaultValue = "ACCOUNT") String resourceType) {
        Long userId = currentUserId();
        Map<String, Object> body = new LinkedHashMap<>();
        // Split the two directions explicitly: what I've exposed, and what I can now see.
        body.put("mine", shareService.mySharedResources(userId, resourceType).stream()
                .map(this::json).toList());
        body.put("sharedWithMe", shareService.visibleFromOthers(userId, resourceType).stream()
                .map(this::json).toList());
        return ResponseEntity.ok(body);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> share(@RequestBody Map<String, Object> body) {
        Long userId = currentUserId();
        HouseholdShare s = shareService.share(userId,
                str(body, "resourceType"), str(body, "resourceId"), str(body, "label"));
        return ResponseEntity.status(HttpStatus.CREATED).body(json(s));
    }

    @DeleteMapping("/{shareId}")
    public ResponseEntity<Void> revoke(@PathVariable Long shareId) {
        shareService.revoke(currentUserId(), shareId);
        return ResponseEntity.noContent().build();
    }

    private Map<String, Object> json(HouseholdShare s) {
        Map<String, Object> j = new LinkedHashMap<>();
        j.put("id", s.getId());
        j.put("resourceType", s.getResourceType());
        j.put("resourceId", s.getResourceId());
        j.put("label", s.getLabel());
        j.put("ownerUserId", s.getOwnerUserId());
        j.put("ownerName", userRepository.findById(s.getOwnerUserId()).map(User::getName).orElse("Member"));
        j.put("sharedAt", s.getCreatedAt());
        return j;
    }

    private static String str(Map<String, Object> body, String key) {
        if (body == null) return null;
        Object v = body.get(key);
        return v != null ? v.toString() : null;
    }

    private Long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        try {
            return Long.valueOf(auth.getName());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid identity");
        }
    }
}
