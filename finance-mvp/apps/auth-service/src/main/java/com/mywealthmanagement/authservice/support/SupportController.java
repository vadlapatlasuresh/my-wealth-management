package com.mywealthmanagement.authservice.support;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.support.dto.SupportUserDetailDto;
import com.mywealthmanagement.authservice.support.dto.SupportUserDto;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
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

    /**
     * Help-desk customer search. Supports either:
     *  - a single free-text {@code query} (matches email OR name), or
     *  - structured multi-field {@code first}/{@code last}/{@code email}/{@code phone} (AND-ed).
     * Blank everything = most recent users. Phone is matched on digits only.
     */
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

    /** Full 360 view: profile + recent activity + issues (failed/denied actions) from audit. */
    @GetMapping("/users/{id}")
    public SupportUserDetailDto getUser(@PathVariable Long id) {
        User u = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        List<Map<String, Object>> activity = auditClient.fetchUserActivity(String.valueOf(id), false, 100);
        List<Map<String, Object>> issues = auditClient.fetchUserActivity(String.valueOf(id), true, 100);
        return toDetail(u, activity, issues);
    }

    /** A user's activity timeline; onlyIssues=true returns just the problems encountered. */
    @GetMapping("/users/{id}/activity")
    public List<Map<String, Object>> getUserActivity(@PathVariable Long id,
                                                     @RequestParam(defaultValue = "false") boolean onlyIssues,
                                                     @RequestParam(defaultValue = "100") int limit) {
        if (!userRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
        }
        return auditClient.fetchUserActivity(String.valueOf(id), onlyIssues, clampSize(limit));
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
        return new SupportUserDetailDto(u.getId(), u.getEmail(), u.getName(), u.getFirstName(),
                u.getLastName(), u.getPhone(), u.getAccountType(), u.getBusinessName(),
                u.getSsnLast4(), u.getEinLast4(), u.getPhoneVerified(), u.getIdentityVerified(),
                roleNames(u), u.getCreatedAt(), u.getUpdatedAt(), issues.size(), activity, issues);
    }

    private static List<String> roleNames(User u) {
        return u.getRoles() == null ? List.of() : u.getRoles().stream().map(Enum::name).toList();
    }

    private static int clampSize(int size) { return Math.min(Math.max(size, 1), 200); }
}
