package com.mywealthmanagement.authservice.support;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.verify.CallerVerificationService;
import com.mywealthmanagement.authservice.verify.DisclosureTier;
import com.mywealthmanagement.authservice.support.dto.SupportUserDetailDto;
import com.mywealthmanagement.authservice.support.dto.SupportUserDto;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * Customer-care / support back-office. Reachable only with a typ=ops token holding an OPS_* role:
 * JwtAuthFilter refuses member tokens on this path, and SecurityConfig checks the roles.
 * Lets a support agent look up a customer and see their full profile + activity + issues.
 *
 * Every access here is audited automatically by the gateway's AuditLoggingFilter, attributed to
 * the ops user. NOTE: that row records the ACTOR, not the customer being viewed — "who looked at
 * customer 42" is currently only answerable from the request path. Adding target_user_id to the
 * audit schema is Phase 3.
 */
@RestController
@RequestMapping("/api/v1/support")
@RequiredArgsConstructor
public class SupportController {

    private final UserRepository userRepository;
    private final AuditClient auditClient;
    private final CallerVerificationService verification;

    /**
     * Help-desk customer search. Supports either:
     *  - a single free-text {@code query} (matches email OR name), or
     *  - structured multi-field {@code first}/{@code last}/{@code email}/{@code phone} (AND-ed).
     * Blank everything = most recent users. Phone is matched on digits only.
     */
    @PreAuthorize("hasAuthority('customer.search')")
    @GetMapping("/users")
    public Page<SupportUserDto> searchUsers(@RequestParam(required = false) String query,
                                            @RequestParam(required = false) String first,
                                            @RequestParam(required = false) String last,
                                            @RequestParam(required = false) String email,
                                            @RequestParam(required = false) String phone,
                                            @RequestParam(defaultValue = "0") int page,
                                            @RequestParam(defaultValue = "25") int size) {
        PageRequest pageable = PageRequest.of(page, clampSize(size), Sort.by(Sort.Direction.DESC, "createdAt"));
        boolean structured = StringUtils.hasText(first) || StringUtils.hasText(last)
                || StringUtils.hasText(email) || StringUtils.hasText(phone);
        Page<User> users;
        if (structured) {
            // Empty string (not null) for absent fields — see searchAdvanced javadoc.
            String phoneDigits = StringUtils.hasText(phone) ? phone.replaceAll("\\D", "") : "";
            users = userRepository.searchAdvanced(
                    blankToEmpty(first), blankToEmpty(last), blankToEmpty(email), phoneDigits, pageable);
        } else if (StringUtils.hasText(query)) {
            users = userRepository.findByEmailContainingIgnoreCaseOrNameContainingIgnoreCase(query, query, pageable);
        } else {
            users = userRepository.findAll(pageable);
        }
        return users.map(this::toSummary);
    }

    private static String blankToEmpty(String s) {
        return StringUtils.hasText(s) ? s.trim() : "";
    }

    /**
     * Full 360 view: profile + recent activity + issues (failed/denied actions) from audit.
     *
     * Opening a record writes an explicit {@code ops.customer.view} carrying the TARGET customer,
     * so "who looked at customer 42" is answerable directly rather than by pattern-matching URLs.
     * No reason is demanded here on purpose: requiring one on every record open trains agents to
     * type "support" a hundred times a day, which destroys the signal it is meant to create.
     * Reasons are demanded where they carry weight — see {@link #revealPii}.
     *
     * SSN/EIN are NOT in this response; they come from the reveal endpoint.
     */
    @PreAuthorize("hasAuthority('customer.view')")
    @GetMapping("/users/{id}")
    public SupportUserDetailDto getUser(@PathVariable Long id) {
        User u = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        List<Map<String, Object>> activity = auditClient.fetchUserActivity(String.valueOf(id), false, 100);
        List<Map<String, Object>> issues = auditClient.fetchUserActivity(String.valueOf(id), true, 100);
        auditClient.recordOps(currentOpsUserId(), "ops.customer.view", "SUCCESS",
                String.valueOf(id), null, null, null);
        return toDetail(u, activity, issues);
    }

    /** A user's activity timeline; onlyIssues=true returns just the problems encountered. */
    @PreAuthorize("hasAuthority('customer.view')")
    @GetMapping("/users/{id}/activity")
    public List<Map<String, Object>> getUserActivity(@PathVariable Long id,
                                                     @RequestParam(defaultValue = "false") boolean onlyIssues,
                                                     @RequestParam(defaultValue = "100") int limit) {
        if (!userRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
        }
        return auditClient.fetchUserActivity(String.valueOf(id), onlyIssues, clampSize(limit));
    }

    /**
     * Unmask a customer's SSN/EIN last-4. Separate endpoint, separate permission, mandatory reason.
     *
     * Why this is not just a field on the 360 view: the common support case — "why did my payment
     * fail?" — never needs an SSN. Leaving it on the record makes every agent's every glance an
     * unrecorded PII access. Pulling it behind a deliberate, reason-carrying, audited action means
     * the trail can answer "who looked at this customer's SSN, and why" — and the answer is
     * usually "nobody", which is the point.
     *
     * Still only the last 4. The full value is encrypted at rest and no ops route returns it.
     *
     * TWO gates, both required: the @PreAuthorize checks the AGENT holds customer.pii.reveal; the
     * verification check confirms the CALLER has proven who they are. A supervisor reading PII to an
     * unverified caller is the exact hole caller-verification closes, so permission alone is not
     * enough here.
     */
    @PreAuthorize("hasAuthority('customer.pii.reveal')")
    @GetMapping("/users/{id}/pii")
    public Map<String, Object> revealPii(@PathVariable Long id, @RequestParam String reason) {
        if (!StringUtils.hasText(reason) || reason.trim().length() < 8) {
            // A reason nobody can understand later is the same as no reason. Rejected loudly
            // rather than silently accepted, so the trail stays worth reading.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A reason of at least 8 characters is required to reveal PII");
        }
        // The caller must be verified enough for PII (T2 by default, DB-editable). Throws 403 with
        // a message telling the agent to verify the caller first.
        verification.requireTierFor(currentOpsUserId(), String.valueOf(id), DisclosureTier.CUSTOMER_PII);

        User u = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        auditClient.recordOps(currentOpsUserId(), "ops.pii.reveal", "SUCCESS",
                String.valueOf(id), reason.trim(), null, null);

        Map<String, Object> pii = new java.util.LinkedHashMap<>();
        pii.put("ssnLast4", u.getSsnLast4());
        pii.put("einLast4", u.getEinLast4());
        return pii;
    }

    /** The acting ops user's id (subject of the typ=ops token). */
    private static String currentOpsUserId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? null : auth.getName();
    }

    // POST /users/{id}/roles (grant/revoke CARE/ADMIN on a customer) has been removed. It was the
    // promotion path that turned an ops agent into a customer holding a token every service
    // trusts — the exact thing separate ops identity exists to prevent. Ops accounts live in
    // `ops_users` and are managed through the ops-admin surface (Phase 2).

    // ---- mapping helpers ----------------------------------------------------
    private SupportUserDto toSummary(User u) {
        return new SupportUserDto(u.getId(), u.getEmail(), u.getName(), u.getPhone(),
                u.getAccountType(), u.getBusinessName(), u.getPhoneVerified(), u.getIdentityVerified(),
                roleNames(u), u.getCreatedAt());
    }

    private SupportUserDetailDto toDetail(User u, List<Map<String, Object>> activity,
                                         List<Map<String, Object>> issues) {
        // ssnLast4/einLast4 are deliberately null here — they are only served by GET
        // /users/{id}/pii, which needs customer.pii.reveal and a written reason. hasSsn/hasEin
        // let the UI show that something is on file (and offer the reveal) without disclosing it.
        return new SupportUserDetailDto(u.getId(), u.getEmail(), u.getName(), u.getFirstName(),
                u.getLastName(), u.getPhone(), u.getAccountType(), u.getBusinessName(),
                null, null,
                StringUtils.hasText(u.getSsnLast4()), StringUtils.hasText(u.getEinLast4()),
                u.getPhoneVerified(), u.getIdentityVerified(),
                roleNames(u), u.getCreatedAt(), u.getUpdatedAt(), issues.size(), activity, issues);
    }

    private static List<String> roleNames(User u) {
        return u.getRoles() == null ? List.of() : u.getRoles().stream().map(Enum::name).toList();
    }

    private static int clampSize(int size) { return Math.min(Math.max(size, 1), 200); }
}
