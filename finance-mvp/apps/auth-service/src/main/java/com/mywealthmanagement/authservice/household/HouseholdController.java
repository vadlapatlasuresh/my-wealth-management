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
import java.util.Optional;

/**
 * Shared Household API (Phase 3a) — membership + invitations only, no data sharing.
 * See docs/designs/SHARED_HOUSEHOLD_DESIGN.md.
 *
 * <pre>
 *   POST   /api/v1/household                      create (creator becomes OWNER)
 *   GET    /api/v1/household/me                   my household + members + pending invites
 *   POST   /api/v1/household/invites              { email }  -> single-use invite token
 *   POST   /api/v1/household/invites/accept       { token }  -> join
 *   DELETE /api/v1/household/invites/{id}         revoke a pending invite (OWNER)
 *   DELETE /api/v1/household/members/{userId}     remove a member (OWNER)
 *   POST   /api/v1/household/leave                leave
 * </pre>
 *
 * NOTE: this is a NEW top-level prefix — it must be added to the api-gateway RouteLocator or
 * every call 404s.
 */
@RestController
@RequestMapping("/api/v1/household")
@RequiredArgsConstructor
public class HouseholdController {

    private final HouseholdService householdService;
    private final UserRepository userRepository;

    // ------------------------------------------------------------------ read

    /** The caller's household, or {"inHousehold": false} when they aren't in one. */
    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> myHousehold() {
        Long userId = currentUserId();
        Optional<HouseholdMember> membership = householdService.activeMembership(userId);
        Map<String, Object> body = new LinkedHashMap<>();
        if (membership.isEmpty()) {
            body.put("inHousehold", false);
            return ResponseEntity.ok(body);
        }
        HouseholdMember me = membership.get();
        Household h = householdService.requireHousehold(me.getHouseholdId());

        body.put("inHousehold", true);
        body.put("householdId", h.getId());
        body.put("name", h.getName());
        body.put("role", me.getRole());
        body.put("members", householdService.activeMembers(h.getId()).stream()
                .map(this::memberJson).toList());
        // Pending invites are owner-only detail.
        body.put("pendingInvites", me.isOwner()
                ? householdService.pendingInvites(h.getId()).stream().map(this::inviteJson).toList()
                : List.of());
        return ResponseEntity.ok(body);
    }

    // ------------------------------------------------------------------ lifecycle

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody(required = false) Map<String, Object> body) {
        Long userId = currentUserId();
        Household h = householdService.create(userId, str(body, "name"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("householdId", h.getId());
        out.put("name", h.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    /**
     * Create an invite. The raw token is returned ONCE so the client can build a link;
     * only its hash is stored, so it can never be read back out of the database.
     */
    @PostMapping("/invites")
    public ResponseEntity<Map<String, Object>> invite(@RequestBody Map<String, Object> body) {
        Long userId = currentUserId();
        Long householdId = requireOwnHouseholdId(userId);
        String token = householdService.invite(userId, householdId, str(body, "email"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", token);
        out.put("email", str(body, "email"));
        out.put("expiresInDays", 7);
        return ResponseEntity.status(HttpStatus.CREATED).body(out);
    }

    @PostMapping("/invites/accept")
    public ResponseEntity<Map<String, Object>> accept(@RequestBody Map<String, Object> body) {
        Long userId = currentUserId();
        String email = userRepository.findById(userId).map(User::getEmail).orElse(null);
        Household h = householdService.accept(userId, email, str(body, "token"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("householdId", h.getId());
        out.put("name", h.getName());
        return ResponseEntity.ok(out);
    }

    @DeleteMapping("/invites/{inviteId}")
    public ResponseEntity<Void> revokeInvite(@PathVariable Long inviteId) {
        Long userId = currentUserId();
        householdService.revokeInvite(userId, requireOwnHouseholdId(userId), inviteId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/members/{targetUserId}")
    public ResponseEntity<Void> removeMember(@PathVariable Long targetUserId) {
        Long userId = currentUserId();
        householdService.removeMember(userId, requireOwnHouseholdId(userId), targetUserId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/leave")
    public ResponseEntity<Void> leave() {
        householdService.leave(currentUserId());
        return ResponseEntity.noContent().build();
    }

    // ------------------------------------------------------------------ helpers

    private Long requireOwnHouseholdId(Long userId) {
        return householdService.activeMembership(userId)
                .map(HouseholdMember::getHouseholdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "You're not in a household"));
    }

    /** Member-facing shape. Names/emails come from auth-service, which already owns them. */
    private Map<String, Object> memberJson(HouseholdMember m) {
        Map<String, Object> j = new LinkedHashMap<>();
        j.put("userId", m.getUserId());
        j.put("role", m.getRole());
        j.put("joinedAt", m.getJoinedAt());
        userRepository.findById(m.getUserId()).ifPresent(u -> {
            j.put("name", u.getName());
            j.put("email", u.getEmail());
        });
        return j;
    }

    /** Invite shape — deliberately never includes the token or its hash. */
    private Map<String, Object> inviteJson(HouseholdInvite i) {
        Map<String, Object> j = new LinkedHashMap<>();
        j.put("id", i.getId());
        j.put("email", i.getInvitedEmail());
        j.put("expiresAt", i.getExpiresAt());
        j.put("createdAt", i.getCreatedAt());
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
