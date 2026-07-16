package com.mywealthmanagement.authservice.ops;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Resolves an ops user's roles into their effective permission set.
 *
 * Resolution happens once, at login, and the result rides in the token's `perms` claim — so a
 * permission change only takes effect on the holder's NEXT login. That is the deliberate
 * trade-off behind the short ops TTL (60 min): it bounds how long a revoked permission stays
 * usable, without a DB lookup on every request. If that window ever proves too long, the fix is
 * to resolve per-request here rather than to lengthen the token.
 */
@Service
@RequiredArgsConstructor
public class OpsPermissionService {

    private static final Logger log = LoggerFactory.getLogger(OpsPermissionService.class);

    private final OpsRoleRepository roleRepository;

    /**
     * The union of every permission granted by any of these roles. Unknown role keys and stale
     * permission keys are skipped with a warning rather than throwing: a typo in the DB should
     * cost an agent one capability, not lock the whole ops team out.
     */
    public Set<String> permissionsFor(List<String> roleKeys) {
        Set<String> perms = new LinkedHashSet<>();
        if (roleKeys == null || roleKeys.isEmpty()) return perms;

        List<OpsRoleEntity> roles = roleRepository.findByRoleKeyIn(roleKeys);
        if (roles.size() != roleKeys.size()) {
            log.warn("[OpsPermissionService] {} of {} role keys resolved — unknown roles are ignored: {}",
                    roles.size(), roleKeys.size(), roleKeys);
        }
        for (OpsRoleEntity role : roles) {
            for (String key : role.getPermissionKeys()) {
                if (OpsPermission.fromKey(key) == null) {
                    log.warn("[OpsPermissionService] role '{}' grants unknown permission '{}' — "
                            + "no endpoint checks it, so it grants nothing.", role.getRoleKey(), key);
                    continue;
                }
                perms.add(key);
            }
        }
        return perms;
    }

    /** Convenience for a single ops user. */
    public Set<String> permissionsFor(OpsUser user) {
        return permissionsFor(user.roleNames());
    }
}
