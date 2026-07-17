package com.mywealthmanagement.authservice.verify;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Caller verification — the person on the phone proving they are the customer, before an agent
 * discloses anything. Every route needs customer.view (you can't verify a caller for a record you
 * can't open) and a typ=ops token.
 *
 * The tier this establishes is checked, server-side, by every disclosure endpoint — see
 * CallerVerificationService.requireTierFor. This controller is how the tier goes UP.
 */
@RestController
@RequestMapping("/api/v1/ops/verify")
@RequiredArgsConstructor
public class CallerVerificationController {

    private final CallerVerificationService verification;

    /** Dev-only echo of the caller's OTP. Its own flag; NOT the member OTP_EXPOSE_DEV_CODE. */
    @Value("${ops.otp.expose-dev-code:false}")
    private boolean exposeDevCode;

    /** Where the caller stands right now: tier + attempt timeline. Called when the record opens. */
    @PreAuthorize("hasAuthority('customer.view')")
    @GetMapping("/{customerId}")
    public Map<String, Object> status(@PathVariable String customerId) {
        String agent = agent();
        VerificationSession s = verification.startOrGet(agent, customerId);
        return statusDto(s, verification.attemptsForCurrent(agent, customerId));
    }

    /** Send an OTP to the customer's REGISTERED channel (never one supplied on the call). */
    @PreAuthorize("hasAuthority('customer.view')")
    @PostMapping("/{customerId}/otp/send")
    public Map<String, Object> sendOtp(@PathVariable String customerId) {
        return verification.sendOtp(agent(), customerId, exposeDevCode);
    }

    /** Confirm the code the caller read back → Tier 2. */
    @PreAuthorize("hasAuthority('customer.view')")
    @PostMapping("/{customerId}/otp/confirm")
    public Map<String, Object> confirmOtp(@PathVariable String customerId, @RequestBody Map<String, String> body) {
        VerificationSession s = verification.confirmOtp(agent(), customerId, body.get("code"));
        return statusDto(s, verification.attemptsForCurrent(agent(), customerId));
    }

    /** A knowledge question to ask, with the expected answer for the agent to compare (not read out). */
    @PreAuthorize("hasAuthority('customer.view')")
    @GetMapping("/{customerId}/kba")
    public Map<String, String> kba(@PathVariable String customerId) {
        return verification.kbaChallenge(customerId);
    }

    /** Agent marks the knowledge answer pass/fail → Tier 1 on pass. */
    @PreAuthorize("hasAuthority('customer.view')")
    @PostMapping("/{customerId}/kba/confirm")
    public Map<String, Object> confirmKba(@PathVariable String customerId, @RequestBody Map<String, Object> body) {
        String factKey = body.get("factKey") == null ? null : String.valueOf(body.get("factKey"));
        boolean passed = Boolean.TRUE.equals(body.get("passed"));
        VerificationSession s = verification.confirmKba(agent(), customerId, factKey, passed);
        return statusDto(s, verification.attemptsForCurrent(agent(), customerId));
    }

    /** Freeze disclosure for the call and raise a fraud signal — the "can't verify" button. */
    @PreAuthorize("hasAuthority('customer.view')")
    @PostMapping("/{customerId}/suspicious")
    public Map<String, Object> suspicious(@PathVariable String customerId, @RequestBody(required = false) Map<String, String> body) {
        verification.flagSuspicious(agent(), customerId, body == null ? null : body.get("note"));
        return statusDto(verification.current(agent(), customerId), List.of());
    }

    private Map<String, Object> statusDto(VerificationSession s, List<VerificationAttempt> attempts) {
        Map<String, Object> m = new LinkedHashMap<>();
        int tier = s == null ? 0 : s.effectiveTier();
        m.put("tier", tier);
        m.put("frozen", s != null && Boolean.TRUE.equals(s.getFrozen()));
        m.put("method", s == null ? null : s.getMethod());
        m.put("expiresAt", s == null ? null : s.getExpiresAt());
        m.put("attempts", attempts.stream().map(a -> {
            Map<String, Object> am = new LinkedHashMap<>();
            am.put("method", a.getMethod());
            am.put("outcome", a.getOutcome());
            am.put("detail", a.getDetail());
            am.put("createdAt", a.getCreatedAt());
            return am;
        }).toList());
        return m;
    }

    private static String agent() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? null : auth.getName();
    }
}
