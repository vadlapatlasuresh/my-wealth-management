package com.mywealthmanagement.authservice.household;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

/**
 * Household membership + invitations (Phase 3a). See docs/designs/SHARED_HOUSEHOLD_DESIGN.md.
 *
 * <p><b>The one authorization rule.</b> Everything household-scoped resolves through
 * {@link #requireActiveMember(Long, Long)}. Keeping it in a single method is the whole point of
 * this design: the alternative — teaching ~59 {@code user_id} columns across 10 services about
 * households — has no single place to get right, and one missed query is a cross-household leak.
 *
 * <p><b>What this does NOT do.</b> Creating or joining a household grants access to
 * household-owned objects only. No personal account, transaction, goal, property or business row
 * becomes visible to anyone. Nothing in this class reads or rewrites another service's data.
 *
 * <p><b>Revocation is immediate</b> because membership is resolved from the database on every
 * request. The household id is deliberately NOT placed in the JWT — a token-cached membership
 * would keep a removed member's access alive until their token expired.
 */
@Service
@RequiredArgsConstructor
public class HouseholdService {

    /** Invite lifetime. Short enough to limit exposure, long enough to be usable. */
    private static final int INVITE_TTL_DAYS = 7;

    private final HouseholdRepository householdRepository;
    private final HouseholdMemberRepository memberRepository;
    private final HouseholdInviteRepository inviteRepository;

    private static final SecureRandom RANDOM = new SecureRandom();

    // ------------------------------------------------------------------ authorization

    /**
     * THE authorization rule for every household-scoped read or write.
     * Throws 403 unless the user is an ACTIVE member of that household.
     */
    public HouseholdMember requireActiveMember(Long userId, Long householdId) {
        return memberRepository.findByHouseholdIdAndUserId(householdId, userId)
                .filter(HouseholdMember::isActive)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN, "You are not a member of this household"));
    }

    /** Owner-only actions (invite, remove a member, rename). */
    public HouseholdMember requireOwner(Long userId, Long householdId) {
        HouseholdMember m = requireActiveMember(userId, householdId);
        if (!m.isOwner()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the household owner can do that");
        }
        return m;
    }

    /** The caller's ACTIVE membership, or empty when they aren't in a household. */
    @Transactional(readOnly = true)
    public Optional<HouseholdMember> activeMembership(Long userId) {
        return memberRepository.findByUserIdAndStatus(userId, HouseholdMember.STATUS_ACTIVE);
    }

    @Transactional(readOnly = true)
    public Household requireHousehold(Long householdId) {
        return householdRepository.findById(householdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Household not found"));
    }

    @Transactional(readOnly = true)
    public List<HouseholdMember> activeMembers(Long householdId) {
        return memberRepository.findByHouseholdIdAndStatus(householdId, HouseholdMember.STATUS_ACTIVE);
    }

    @Transactional(readOnly = true)
    public List<HouseholdInvite> pendingInvites(Long householdId) {
        return inviteRepository.findByHouseholdIdAndStatus(householdId, HouseholdInvite.STATUS_PENDING);
    }

    // ------------------------------------------------------------------ lifecycle

    /** Create a household; the creator becomes its OWNER. v1: one household per user. */
    @Transactional
    public Household create(Long userId, String name) {
        activeMembership(userId).ifPresent(m -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "You're already in a household. Leave it before creating another.");
        });
        Household h = new Household();
        h.setName(name == null || name.isBlank() ? "Our household" : name.trim());
        h.setCreatedByUserId(userId);
        Household saved = householdRepository.save(h);

        HouseholdMember owner = new HouseholdMember();
        owner.setHouseholdId(saved.getId());
        owner.setUserId(userId);
        owner.setRole(HouseholdMember.ROLE_OWNER);
        owner.setStatus(HouseholdMember.STATUS_ACTIVE);
        memberRepository.save(owner);
        return saved;
    }

    /**
     * Create a single-use invite. Returns the RAW token — the caller shows it once (as a link);
     * only its hash is persisted, so it can never be recovered from the database.
     */
    @Transactional
    public String invite(Long userId, Long householdId, String email) {
        requireOwner(userId, householdId);
        if (email == null || email.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An email address is required");
        }
        String rawToken = newToken();
        HouseholdInvite inv = new HouseholdInvite();
        inv.setHouseholdId(householdId);
        inv.setInvitedEmail(email.trim().toLowerCase());
        inv.setTokenHash(sha256(rawToken));
        inv.setInvitedByUserId(userId);
        inv.setStatus(HouseholdInvite.STATUS_PENDING);
        inv.setExpiresAt(LocalDateTime.now().plusDays(INVITE_TTL_DAYS));
        inviteRepository.save(inv);
        return rawToken;
    }

    /**
     * Accept an invite. The token must be pending, unexpired, and — critically — presented by
     * the account whose email it was issued to, so a leaked link can't be redeemed by a stranger.
     */
    @Transactional
    public Household accept(Long userId, String userEmail, String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An invite token is required");
        }
        HouseholdInvite inv = inviteRepository.findByTokenHash(sha256(rawToken))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "This invite is not valid"));

        if (!inv.isPending()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This invite has already been used or revoked");
        }
        if (inv.isExpired()) {
            inv.setStatus(HouseholdInvite.STATUS_EXPIRED);
            inviteRepository.save(inv);
            throw new ResponseStatusException(HttpStatus.GONE, "This invite has expired");
        }
        if (userEmail == null || !inv.getInvitedEmail().equalsIgnoreCase(userEmail.trim())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This invite was sent to a different email address");
        }
        activeMembership(userId).ifPresent(m -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "You're already in a household. Leave it before joining another.");
        });

        // Re-joining a household they previously left reuses the existing row.
        HouseholdMember member = memberRepository
                .findByHouseholdIdAndUserId(inv.getHouseholdId(), userId)
                .orElseGet(HouseholdMember::new);
        member.setHouseholdId(inv.getHouseholdId());
        member.setUserId(userId);
        member.setRole(HouseholdMember.ROLE_MEMBER);
        member.setStatus(HouseholdMember.STATUS_ACTIVE);
        member.setLeftAt(null);
        memberRepository.save(member);

        inv.setStatus(HouseholdInvite.STATUS_ACCEPTED);
        inv.setAcceptedAt(LocalDateTime.now());
        inv.setAcceptedUserId(userId);
        inviteRepository.save(inv);

        return requireHousehold(inv.getHouseholdId());
    }

    @Transactional
    public void revokeInvite(Long userId, Long householdId, Long inviteId) {
        requireOwner(userId, householdId);
        HouseholdInvite inv = inviteRepository.findById(inviteId)
                .filter(i -> i.getHouseholdId().equals(householdId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invite not found"));
        inv.setStatus(HouseholdInvite.STATUS_REVOKED);
        inviteRepository.save(inv);
    }

    /** Owner removes a member. Access is gone on that member's very next request. */
    @Transactional
    public void removeMember(Long actingUserId, Long householdId, Long targetUserId) {
        requireOwner(actingUserId, householdId);
        if (actingUserId.equals(targetUserId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Transfer ownership before removing yourself");
        }
        HouseholdMember m = requireActiveMember(targetUserId, householdId);
        m.setStatus(HouseholdMember.STATUS_REMOVED);
        m.setLeftAt(LocalDateTime.now());
        memberRepository.save(m);
    }

    /** A member leaves. The owner must transfer ownership first (v1 keeps this simple). */
    @Transactional
    public void leave(Long userId) {
        HouseholdMember m = activeMembership(userId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.CONFLICT, "You're not in a household"));
        if (m.isOwner() && activeMembers(m.getHouseholdId()).size() > 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Transfer ownership to another member before leaving");
        }
        m.setStatus(HouseholdMember.STATUS_LEFT);
        m.setLeftAt(LocalDateTime.now());
        memberRepository.save(m);
    }

    // ------------------------------------------------------------------ helpers

    private static String newToken() {
        byte[] buf = new byte[32];
        RANDOM.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    static String sha256(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
