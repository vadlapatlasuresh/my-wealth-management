package com.mywealthmanagement.authservice.ops;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.auth.PasswordPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

/**
 * Ops account + role administration. This is where staff access is granted — never from a
 * customer's record, which is what the old (removed) promotion path did.
 *
 * Everything here needs {@code ops.user.manage}, and every mutation is audited against the acting
 * admin. Note the target of these actions is another OPS user, not a customer, so the events carry
 * no targetUserId — they are recorded with the affected ops account in the metadata instead.
 */
@RestController
@RequestMapping("/api/v1/ops/admin")
@RequiredArgsConstructor
public class OpsAdminController {

    private final OpsUserRepository opsUserRepository;
    private final OpsRoleRepository roleRepository;
    private final OpsAuthService opsAuthService;
    private final PasswordPolicy passwordPolicy;
    private final AuditClient auditClient;

    // ---- Catalog: what access exists, and what each role grants -----------------------------

    /**
     * The permission catalog, straight from the enum — the authoritative list of what can be
     * gated, with a plain-English description of what holding each key actually allows.
     */
    @PreAuthorize("hasAuthority('ops.user.manage')")
    @GetMapping("/permissions")
    public List<Map<String, Object>> permissions() {
        return OpsPermission.all().stream().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("key", p.key());
            m.put("category", p.category());
            m.put("description", p.description());
            return m;
        }).toList();
    }

    /** Every role and the permissions it grants — the access matrix, as it actually is right now. */
    @PreAuthorize("hasAuthority('ops.user.manage')")
    @GetMapping("/roles")
    public List<Map<String, Object>> roles() {
        return roleRepository.findAllByOrderByRoleKeyAsc().stream().map(this::roleDto).toList();
    }

    /**
     * Retune what a role grants. Roles are DB-editable so the matrix can change without a deploy;
     * the permission KEYS are not, because a key no endpoint checks would grant nothing while
     * looking like a control.
     */
    @PreAuthorize("hasAuthority('ops.user.manage')")
    @PutMapping("/roles/{roleKey}/permissions")
    public Map<String, Object> setRolePermissions(@PathVariable String roleKey,
                                                  @RequestBody Map<String, List<String>> body) {
        OpsRoleEntity role = roleRepository.findById(roleKey)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown role: " + roleKey));

        List<String> requested = body.getOrDefault("permissions", List.of());
        List<String> unknown = requested.stream().filter(k -> OpsPermission.fromKey(k) == null).toList();
        if (!unknown.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown permission(s): " + String.join(", ", unknown));
        }

        Set<String> before = new LinkedHashSet<>(role.getPermissionKeys());
        Set<String> after = new LinkedHashSet<>(requested);

        // An ops admin removing ops.user.manage from their own last admin role locks everyone out
        // of role management permanently — there is no other way back in. Refuse.
        if (before.contains(OpsPermission.OPS_USER_MANAGE.key()) && !after.contains(OpsPermission.OPS_USER_MANAGE.key())
                && !anyOtherRoleGrantsUserManage(roleKey)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Refusing to remove ops.user.manage from the only role that grants it — "
                            + "no one would be able to administer ops accounts afterwards.");
        }

        role.setPermissionKeys(after);
        roleRepository.save(role);
        auditClient.recordOps(currentOpsUserId(), "ops.role.permissions.update", "SUCCESS", null,
                "role=" + roleKey, json(before), json(after));
        return roleDto(role);
    }

    // ---- Ops accounts ------------------------------------------------------------------------

    @PreAuthorize("hasAuthority('ops.user.manage')")
    @GetMapping("/users")
    public List<Map<String, Object>> listOpsUsers() {
        return opsUserRepository.findAll().stream().map(this::opsUserDto).toList();
    }

    /** Create an ops account. Roles must already exist; the password must meet the same policy as members'. */
    @PreAuthorize("hasAuthority('ops.user.manage')")
    @PostMapping("/users")
    public Map<String, Object> createOpsUser(@RequestBody Map<String, Object> body) {
        String email = str(body.get("email"));
        String password = str(body.get("password"));
        String name = str(body.get("name"));
        List<String> roleKeys = toRoleKeys(body.get("roles"));

        if (!StringUtils.hasText(email) || !StringUtils.hasText(password)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "email and password are required");
        }
        if (opsUserRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An ops account with that email already exists");
        }
        // Same password policy as members — an ops account is strictly more dangerous, so it
        // never gets a weaker bar.
        List<String> violations = passwordPolicy.violations(password);
        if (!violations.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, String.join("; ", violations));
        }
        requireKnownRoles(roleKeys);

        OpsUser user = new OpsUser();
        user.setEmail(email.trim());
        user.setPasswordHash(opsAuthService.hash(password));
        user.setName(name);
        user.setPhone(str(body.get("phone")));
        if (StringUtils.hasText(str(body.get("mfaChannel")))) {
            user.setMfaChannel(str(body.get("mfaChannel")).toUpperCase());
        }
        user.setActive(true);
        user.setCreatedBy(currentOpsUserId());
        user.setRoles(new LinkedHashSet<>(roleKeys));
        OpsUser saved = opsUserRepository.save(user);

        auditClient.recordOps(currentOpsUserId(), "ops.user.create", "SUCCESS", null,
                "created ops account " + saved.getEmail(), null,
                json(Map.of("id", saved.getId(), "email", saved.getEmail(), "roles", roleKeys)));
        return opsUserDto(saved);
    }

    /** Replace an ops user's roles. */
    @PreAuthorize("hasAuthority('ops.user.manage')")
    @PutMapping("/users/{id}/roles")
    public Map<String, Object> setRoles(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        OpsUser user = opsUserRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ops user not found"));
        List<String> roleKeys = toRoleKeys(body.get("roles"));
        requireKnownRoles(roleKeys);

        Set<String> before = new LinkedHashSet<>(user.roleNames());
        user.setRoles(new LinkedHashSet<>(roleKeys));
        opsUserRepository.save(user);

        auditClient.recordOps(currentOpsUserId(), "ops.user.roles.update", "SUCCESS", null,
                "ops account " + user.getEmail(), json(before), json(new LinkedHashSet<>(roleKeys)));
        return opsUserDto(user);
    }

    /**
     * Activate/deactivate an ops account. Deactivation is the off-switch — ops users are never
     * deleted, because their audit history has to keep resolving to a real person.
     */
    @PreAuthorize("hasAuthority('ops.user.manage')")
    @PostMapping("/users/{id}/active")
    public Map<String, Object> setActive(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        OpsUser user = opsUserRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ops user not found"));
        boolean active = Boolean.TRUE.equals(body.get("active"));

        if (!active && String.valueOf(user.getId()).equals(currentOpsUserId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You cannot deactivate your own account");
        }
        boolean before = Boolean.TRUE.equals(user.getActive());
        user.setActive(active);
        if (active) {
            // Reactivating clears any standing lockout; otherwise the account is back but unusable.
            user.setLockedUntil(null);
            user.setFailedLoginAttempts(0);
        }
        opsUserRepository.save(user);

        auditClient.recordOps(currentOpsUserId(), active ? "ops.user.activate" : "ops.user.deactivate",
                "SUCCESS", null, "ops account " + user.getEmail(),
                json(Map.of("active", before)), json(Map.of("active", active)));
        return opsUserDto(user);
    }

    // ---- helpers ------------------------------------------------------------------------------

    private boolean anyOtherRoleGrantsUserManage(String excludingRoleKey) {
        return roleRepository.findAll().stream()
                .filter(r -> !r.getRoleKey().equals(excludingRoleKey))
                .anyMatch(r -> r.getPermissionKeys().contains(OpsPermission.OPS_USER_MANAGE.key()));
    }

    private void requireKnownRoles(List<String> roleKeys) {
        if (roleKeys.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one role is required");
        }
        List<String> unknown = roleKeys.stream().filter(k -> !roleRepository.existsById(k)).toList();
        if (!unknown.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown role(s): " + String.join(", ", unknown));
        }
    }

    private Map<String, Object> roleDto(OpsRoleEntity r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", r.getRoleKey());
        m.put("name", r.getName());
        m.put("description", r.getDescription());
        m.put("builtin", r.getBuiltin());
        m.put("permissions", new ArrayList<>(r.getPermissionKeys()));
        return m;
    }

    private Map<String, Object> opsUserDto(OpsUser u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("email", u.getEmail());
        m.put("name", u.getName());
        m.put("active", u.getActive());
        m.put("locked", u.isLocked());
        m.put("roles", u.roleNames());
        // The effective set, resolved through their roles — what this person can actually do.
        m.put("permissions", new ArrayList<>(opsAuthService.permissionsOf(u)));
        m.put("lastLoginAt", u.getLastLoginAt());
        m.put("createdAt", u.getCreatedAt());
        return m;
    }

    private static List<String> toRoleKeys(Object raw) {
        if (raw instanceof List<?> list) {
            return list.stream().map(String::valueOf).map(String::trim).filter(s -> !s.isEmpty()).toList();
        }
        return List.of();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o).trim();
    }

    /** Minimal JSON for the audit before/after fields — these are short, flat maps and sets. */
    private static String json(Object o) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(o);
        } catch (Exception e) {
            return String.valueOf(o);
        }
    }

    private static String currentOpsUserId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? null : auth.getName();
    }
}
