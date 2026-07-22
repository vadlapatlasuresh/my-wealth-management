package com.mywealthmanagement.authservice.household;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Opt-in sharing of personal resources with a household (Phase 3c).
 *
 * <p><b>Default private.</b> Joining a household shares nothing. A resource becomes visible to
 * other members only when its owner creates a share here, and stops being visible the moment the
 * share is deleted — access is resolved per request, so revocation is immediate.
 *
 * <p><b>You can only share what is yours.</b> Shares are always recorded against the caller as
 * owner; there is no path to share someone else's resource, and no path to grant a share into a
 * household you are not an active member of.
 *
 * <p><b>Nothing existing is re-scoped.</b> This service only reads and writes the share registry.
 * The actual account data is still fetched by its owning service under the usual
 * {@code WHERE user_id = :me} rules — the client asks for shared resources through a separate,
 * additive path. A bug here can at worst fail to reveal shared data; it cannot widen an
 * existing query.
 */
@Service
@RequiredArgsConstructor
public class HouseholdShareService {

    private final HouseholdService households;
    private final HouseholdShareRepository shares;

    private Long householdOf(Long userId) {
        return households.activeMembership(userId)
                .map(HouseholdMember::getHouseholdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "You're not in a household"));
    }

    /** Everything currently shared into the caller's household, by any member. */
    @Transactional(readOnly = true)
    public List<HouseholdShare> sharedWithMyHousehold(Long userId, String resourceType) {
        return shares.findByHouseholdIdAndResourceType(householdOf(userId), type(resourceType));
    }

    /** What the CALLER has shared — so they can see and revoke their own grants. */
    @Transactional(readOnly = true)
    public List<HouseholdShare> mySharedResources(Long userId, String resourceType) {
        return shares.findByOwnerUserIdAndResourceType(userId, type(resourceType));
    }

    /** Share one of my resources with my household. Idempotent. */
    @Transactional
    public HouseholdShare share(Long userId, String resourceType, String resourceId, String label) {
        Long householdId = householdOf(userId);
        String t = type(resourceType);
        if (resourceId == null || resourceId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A resource id is required");
        }
        // Sharing twice is a no-op rather than a second grant or a constraint violation.
        return shares.findByHouseholdIdAndOwnerUserIdAndResourceTypeAndResourceId(
                        householdId, userId, t, resourceId)
                .orElseGet(() -> {
                    HouseholdShare s = new HouseholdShare();
                    s.setHouseholdId(householdId);
                    s.setOwnerUserId(userId);   // always the caller — you cannot share what isn't yours
                    s.setResourceType(t);
                    s.setResourceId(resourceId);
                    s.setLabel(label);
                    return shares.save(s);
                });
    }

    /**
     * Stop sharing. Only the OWNER of the share may revoke it — a household member cannot
     * un-share someone else's resource, and cannot revoke a share belonging to another household.
     */
    @Transactional
    public void revoke(Long userId, Long shareId) {
        HouseholdShare s = shares.findById(shareId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Share not found"));
        if (!s.getOwnerUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the person who shared this can stop sharing it");
        }
        shares.delete(s);
    }

    /**
     * The resource ids the caller is allowed to see for a given type: their own are handled by the
     * owning service as usual, so this returns only the ones OTHER members shared with them.
     * Returns empty (never throws) when the caller has no household, so callers can treat
     * "no household" and "nothing shared" identically.
     */
    @Transactional(readOnly = true)
    public List<HouseholdShare> visibleFromOthers(Long userId, String resourceType) {
        return households.activeMembership(userId)
                .map(m -> shares.findByHouseholdIdAndResourceType(m.getHouseholdId(), type(resourceType))
                        .stream()
                        .filter(s -> !s.getOwnerUserId().equals(userId))
                        .toList())
                .orElseGet(List::of);
    }

    private static String type(String resourceType) {
        String t = resourceType == null ? HouseholdShare.TYPE_ACCOUNT : resourceType.trim().toUpperCase();
        if (!HouseholdShare.TYPE_ACCOUNT.equals(t)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only ACCOUNT sharing is supported today");
        }
        return t;
    }
}
