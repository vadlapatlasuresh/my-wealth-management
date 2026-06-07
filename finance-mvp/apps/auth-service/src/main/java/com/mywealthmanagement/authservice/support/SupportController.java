package com.mywealthmanagement.authservice.support;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.support.dto.SupportUserDetailDto;
import com.mywealthmanagement.authservice.support.dto.SupportUserDto;
import com.mywealthmanagement.authservice.user.Role;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Customer-care / support back-office. Gated to ROLE_CARE / ROLE_ADMIN in SecurityConfig.
 * Lets a support agent look up a user and see their full profile + activity + issues encountered.
 * Every access here is itself audited automatically by the gateway's AuditLoggingFilter.
 */
@RestController
@RequestMapping("/api/v1/support")
@RequiredArgsConstructor
public class SupportController {

    private final UserRepository userRepository;
    private final AuditClient auditClient;

    /** Search users by email or name (blank query = most recent users). */
    @GetMapping("/users")
    public Page<SupportUserDto> searchUsers(@RequestParam(required = false) String query,
                                            @RequestParam(defaultValue = "0") int page,
                                            @RequestParam(defaultValue = "25") int size) {
        PageRequest pageable = PageRequest.of(page, clampSize(size), Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<User> users = StringUtils.hasText(query)
                ? userRepository.findByEmailContainingIgnoreCaseOrNameContainingIgnoreCase(query, query, pageable)
                : userRepository.findAll(pageable);
        return users.map(this::toSummary);
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

    /** Grant/revoke a role (ADMIN only — enforced by SecurityConfig path matcher). */
    @PostMapping("/users/{id}/roles")
    public ResponseEntity<SupportUserDto> changeRole(@PathVariable Long id, @RequestBody RoleChange body) {
        User u = userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        Role role;
        try {
            role = Role.valueOf(body.role().toUpperCase());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown role: " + body.role());
        }
        Set<Role> roles = new LinkedHashSet<>(u.getRoles() != null ? u.getRoles() : Set.of());
        boolean grant = !"REVOKE".equalsIgnoreCase(body.action());
        if (grant) roles.add(role); else roles.remove(role);
        u.setRoles(roles);
        User saved = userRepository.save(u);

        // Audit this sensitive change explicitly, attributed to the acting admin.
        String actor = SecurityContextHolder.getContext().getAuthentication().getName();
        auditClient.record(actor, "support.role." + (grant ? "grant" : "revoke"), "SUCCESS",
                "target=" + id + " role=" + role);
        return ResponseEntity.ok(toSummary(saved));
    }

    public record RoleChange(String role, String action) {}

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
