package com.mywealthmanagement.authservice.verify;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.auth.NotificationClient;
import com.mywealthmanagement.authservice.auth.OtpService;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Caller verification: proving the person on the phone is the customer, before an agent discloses
 * their data. Tiered and per-call. Design: DOCUMENTATION/proposals/ops-caller-verification.md.
 *
 * The disclosure gate ({@link #requireTierFor}) is the point of the whole thing: it sits IN FRONT
 * of the permission check, so a supervisor who holds customer.pii.reveal still cannot reveal PII to
 * an unverified caller. Permissions say what the agent may do; this says what the caller has proven.
 */
@Service
@RequiredArgsConstructor
public class CallerVerificationService {

    private final VerificationSessionRepository sessions;
    private final VerificationAttemptRepository attempts;
    private final DisclosureTierRepository tiers;
    private final UserRepository users;
    private final OtpService otpService;
    private final NotificationClient notificationClient;
    private final AuditClient auditClient;

    @Value("${verify.session.minutes:30}")
    private int sessionMinutes;

    /** Failed attempts in the window before the account is flagged and further tries are frozen. */
    @Value("${verify.lockout.max-fails:3}")
    private int maxFails;

    @Value("${verify.lockout.window-minutes:30}")
    private int failWindowMinutes;

    // ---- Session lifecycle --------------------------------------------------------------------

    /**
     * The live session for this agent+customer, creating a fresh Tier-0 one if none is active.
     * Called when the agent opens the record: verification starts cold every call.
     */
    public VerificationSession startOrGet(String agentId, String customerId) {
        VerificationSession existing = sessions.findTopByAgentIdAndCustomerIdOrderByStartedAtDesc(agentId, customerId);
        if (existing != null && existing.getExpiresAt().isAfter(LocalDateTime.now())) {
            // Still within the window — reuse it, INCLUDING a frozen one. A "can't verify" freeze
            // must persist for the call: creating a fresh unfrozen session on the next action would
            // let one click undo the agent's decision that the caller isn't who they claim.
            return existing;
        }
        VerificationSession s = new VerificationSession();
        s.setAgentId(agentId);
        s.setCustomerId(customerId);
        s.setTier(VerificationSession.Tier.UNVERIFIED);
        s.setStartedAt(now());
        s.setExpiresAt(now().plusMinutes(sessionMinutes));
        VerificationSession saved = sessions.save(s);
        auditClient.recordOps(agentId, "ops.caller.verify.start", "SUCCESS", customerId,
                null, null, null);
        return saved;
    }

    /** The current session, or null if the agent hasn't opened this customer this call. */
    public VerificationSession current(String agentId, String customerId) {
        return sessions.findTopByAgentIdAndCustomerIdOrderByStartedAtDesc(agentId, customerId);
    }

    /** The caller's effective tier right now (0 if none, expired, or frozen). */
    public int effectiveTier(String agentId, String customerId) {
        VerificationSession s = current(agentId, customerId);
        return s == null ? 0 : s.effectiveTier();
    }

    // ---- The gate -----------------------------------------------------------------------------

    /**
     * Enforce that the caller is verified enough for a given disclosure. Throws 403 otherwise.
     *
     * This is deliberately separate from — and checked ALONGSIDE — the @PreAuthorize permission
     * check. The agent having the permission is necessary but not sufficient; the caller must also
     * have proven themselves. The required tier is DB-editable (ops_disclosure_tiers).
     */
    public void requireTierFor(String agentId, String customerId, String actionKey) {
        int required = requiredTier(actionKey);
        int have = effectiveTier(agentId, customerId);
        if (have < required) {
            // Audited as a DENIED disclosure — an agent repeatedly hitting this wall on one
            // customer is itself worth seeing.
            auditClient.recordOps(agentId, "ops.disclosure.blocked", "DENIED", customerId,
                    "action=" + actionKey + " need=T" + required + " have=T" + have, null, null);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "The caller is verified to Tier " + have + " but this needs Tier " + required
                            + ". Verify the caller (send an OTP to their registered device) first.");
        }
    }

    /** The minimum tier for an action, from the DB mapping; defaults to POSSESSION if unmapped. */
    public int requiredTier(String actionKey) {
        return tiers.findById(actionKey).map(DisclosureTier::getMinTier)
                .orElse(VerificationSession.Tier.POSSESSION); // unknown action -> conservative default
    }

    // ---- OTP method (-> Tier 2) ---------------------------------------------------------------

    /**
     * Send a one-time code to the customer's REGISTERED channel — never one the caller supplies on
     * the call. That is the whole security property: it proves the caller controls a channel we
     * already trust, not that they can receive a code somewhere new.
     *
     * @return the masked destination + (dev only) the code, mirroring the member MFA flow
     */
    public Map<String, Object> sendOtp(String agentId, String customerId, boolean exposeDevCode) {
        VerificationSession session = startOrGet(agentId, customerId);
        if (Boolean.TRUE.equals(session.getFrozen())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This caller was flagged as unverifiable on this call. Offer a callback to the number on file.");
        }
        User u = customer(customerId);

        String channel = "SMS".equalsIgnoreCase(u.getMfaChannel()) && has(u.getPhone()) ? "SMS" : "EMAIL";
        String recipient = "SMS".equals(channel) ? u.getPhone() : u.getEmail();
        if (!has(recipient)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "No registered " + channel.toLowerCase() + " on file to send a code to. Use a knowledge question instead.");
        }
        String code = otpService.generateFor(otpKey(agentId, customerId));
        notificationClient.sendOtp(channel, recipient, code, "caller-verification");

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("sent", true);
        r.put("channel", channel);
        r.put("destination", "SMS".equals(channel) ? maskPhone(u.getPhone()) : maskEmail(u.getEmail()));
        if (exposeDevCode) r.put("devCode", code);
        return r;
    }

    /** Confirm the code the caller read back → raise to Tier 2 (POSSESSION). */
    public VerificationSession confirmOtp(String agentId, String customerId, String code) {
        VerificationSession session = startOrGet(agentId, customerId);
        boolean ok = otpService.verifyFor(otpKey(agentId, customerId), code == null ? "" : code.trim());
        if (!ok) {
            recordAttempt(session, VerificationAttempt.METHOD_OTP, VerificationAttempt.OUTCOME_FAIL, null);
            failGuard(agentId, customerId, session);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "That code was wrong or expired.");
        }
        raise(session, VerificationSession.Tier.POSSESSION, VerificationAttempt.METHOD_OTP);
        recordAttempt(session, VerificationAttempt.METHOD_OTP, VerificationAttempt.OUTCOME_PASS, null);
        auditClient.recordOps(agentId, "ops.caller.verify.pass", "SUCCESS", customerId,
                "method=OTP tier=2", null, null);
        return session;
    }

    // ---- KBA method (-> Tier 1) ---------------------------------------------------------------

    /**
     * A knowledge question to ask the caller, with the expected answer for the AGENT to compare
     * against. The agent already has access to this customer's data, so showing them one fact to
     * verify against is not a new disclosure — but they mark pass/fail, they never read it out.
     *
     * Picks from whatever the customer actually has on file, so the question is answerable.
     */
    public Map<String, String> kbaChallenge(String customerId) {
        User u = customer(customerId);
        List<String[]> candidates = new ArrayList<>(); // {key, prompt, expected}
        if (u.getDateOfBirth() != null) {
            candidates.add(new String[]{"date_of_birth", "their date of birth", u.getDateOfBirth().toString()});
        }
        if (has(u.getPostalCode())) {
            candidates.add(new String[]{"postal_code", "the postal/ZIP code on their account", u.getPostalCode()});
        }
        if (has(u.getAddressLine1())) {
            candidates.add(new String[]{"address", "the first line of their address on file", u.getAddressLine1()});
        }
        // SSN-last-4 is deliberately NOT offered as a KBA fact. The agent sees the expected answer
        // to compare against, and showing SSN to an agent who lacks customer.pii.reveal would route
        // around that permission. DOB / postcode / address are enough to establish Tier 1, and none
        // of them is gated PII.
        if (candidates.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "No knowledge facts on file for this customer. Use an OTP to their registered device.");
        }
        String[] pick = candidates.get(new Random().nextInt(candidates.size()));
        Map<String, String> m = new LinkedHashMap<>();
        m.put("factKey", pick[0]);
        m.put("prompt", "Ask the caller for " + pick[1] + ".");
        m.put("expected", pick[2]); // agent-only; compared, never read out
        return m;
    }

    /** Agent confirms the caller answered the knowledge question correctly → Tier 1 (IDENTITY). */
    public VerificationSession confirmKba(String agentId, String customerId, String factKey, boolean passed) {
        VerificationSession session = startOrGet(agentId, customerId);
        if (!passed) {
            recordAttempt(session, VerificationAttempt.METHOD_KBA, VerificationAttempt.OUTCOME_FAIL, factKey);
            failGuard(agentId, customerId, session);
            auditClient.recordOps(agentId, "ops.caller.verify.fail", "FAILURE", customerId,
                    "method=KBA fact=" + factKey, null, null);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Knowledge check failed.");
        }
        // KBA only ever grants IDENTITY — never downgrade a caller already at POSSESSION via OTP.
        raise(session, VerificationSession.Tier.IDENTITY, VerificationAttempt.METHOD_KBA);
        recordAttempt(session, VerificationAttempt.METHOD_KBA, VerificationAttempt.OUTCOME_PASS, factKey);
        auditClient.recordOps(agentId, "ops.caller.verify.pass", "SUCCESS", customerId,
                "method=KBA fact=" + factKey + " tier=1", null, null);
        return session;
    }

    // ---- Suspicious / freeze ------------------------------------------------------------------

    /**
     * The agent's escape hatch: freeze disclosure for the call and raise a fraud signal. The tool
     * makes "no" the safe default, so the agent never has to argue with a social engineer.
     */
    public void flagSuspicious(String agentId, String customerId, String note) {
        VerificationSession session = startOrGet(agentId, customerId);
        session.setFrozen(true);
        session.setTier(VerificationSession.Tier.UNVERIFIED);
        sessions.save(session);
        auditClient.recordOps(agentId, "ops.caller.verify.suspicious", "DENIED", customerId,
                note == null || note.isBlank() ? "flagged suspicious" : note, null, null);
    }

    // ---- Timeline -----------------------------------------------------------------------------

    /** The verification attempts on the current session, for the disclosure timeline. */
    public List<VerificationAttempt> attemptsForCurrent(String agentId, String customerId) {
        VerificationSession s = current(agentId, customerId);
        return s == null ? List.of() : attempts.findBySessionIdOrderByCreatedAtAsc(s.getId());
    }

    /** The seeded action -> min-tier mapping, for display and admin. */
    public List<DisclosureTier> tierMap() {
        return tiers.findAllByOrderByMinTierAsc();
    }

    // ---- internals ----------------------------------------------------------------------------

    private void raise(VerificationSession s, int toTier, String method) {
        if (Boolean.TRUE.equals(s.getFrozen())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This caller was flagged unverifiable on this call.");
        }
        if (s.effectiveTier() < toTier) {
            s.setTier(toTier);
            s.setMethod(method);
            if (s.getVerifiedAt() == null) s.setVerifiedAt(now());
            // A successful step also refreshes the window — the caller is demonstrably present.
            s.setExpiresAt(now().plusMinutes(sessionMinutes));
            sessions.save(s);
        }
    }

    private void recordAttempt(VerificationSession s, String method, String outcome, String detail) {
        VerificationAttempt a = new VerificationAttempt();
        a.setSessionId(s.getId());
        a.setAgentId(s.getAgentId());
        a.setCustomerId(s.getCustomerId());
        a.setMethod(method);
        a.setOutcome(outcome);
        a.setDetail(detail);
        a.setCreatedAt(now());
        attempts.save(a);
    }

    /**
     * Repeated failed verification is the single best fraud signal a desk has. Past the threshold,
     * freeze the session so a fourth guess can't land, and audit it loudly.
     */
    private void failGuard(String agentId, String customerId, VerificationSession session) {
        long fails = attempts.countByCustomerIdAndOutcomeAndCreatedAtAfter(
                customerId, VerificationAttempt.OUTCOME_FAIL, now().minusMinutes(failWindowMinutes));
        if (fails >= maxFails) {
            session.setFrozen(true);
            session.setTier(VerificationSession.Tier.UNVERIFIED);
            sessions.save(session);
            auditClient.recordOps(agentId, "ops.caller.verify.locked", "DENIED", customerId,
                    "reason=too_many_failed_verifications count=" + fails, null, null);
        }
    }

    private User customer(String customerId) {
        try {
            return users.findById(Long.valueOf(customerId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer not found"));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid customer id");
        }
    }

    private static String otpKey(String agentId, String customerId) {
        return "caller-verify:" + agentId + ":" + customerId;
    }

    private static boolean has(String s) {
        return s != null && !s.isBlank();
    }

    private static LocalDateTime now() {
        return LocalDateTime.now().truncatedTo(ChronoUnit.MICROS);
    }

    private static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "the email on file";
        int at = email.indexOf('@');
        return email.charAt(0) + "•••" + email.substring(at);
    }

    private static String maskPhone(String phone) {
        if (phone == null || phone.length() < 4) return "the phone on file";
        return "•••-•••-" + phone.substring(phone.length() - 4);
    }
}
