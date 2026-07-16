package com.mywealthmanagement.authservice.ops;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Creates the very first ops account, so there is a way in after V8 revoked the old
 * CARE/ADMIN grants from customer rows.
 *
 * This REPLACES the old SupportBootstrap, which promoted an existing customer to ADMIN+CARE.
 * That promotion is exactly what this work removes: it made an ops agent a customer holding a
 * member token that every service accepted. There is deliberately no promotion path here — an
 * ops account is created as an ops account, or not at all.
 *
 * Runs only when both properties are set AND the account does not already exist, so leaving the
 * env vars in place across restarts is harmless and never resets a password.
 */
@Component
public class OpsBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(OpsBootstrap.class);

    private final OpsUserRepository opsUserRepository;
    private final OpsAuthService opsAuthService;

    @Value("${ops.bootstrap.email:}")
    private String bootstrapEmail;

    @Value("${ops.bootstrap.password:}")
    private String bootstrapPassword;

    public OpsBootstrap(OpsUserRepository opsUserRepository, OpsAuthService opsAuthService) {
        this.opsUserRepository = opsUserRepository;
        this.opsAuthService = opsAuthService;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (bootstrapEmail == null || bootstrapEmail.isBlank()) {
            if (opsUserRepository.count() == 0) {
                log.warn("[OpsBootstrap] No ops accounts exist and OPS_BOOTSTRAP_EMAIL is unset — "
                        + "the ops portal is unreachable. Set OPS_BOOTSTRAP_EMAIL + OPS_BOOTSTRAP_PASSWORD "
                        + "and restart to create the first ops_admin.");
            }
            return;
        }
        if (bootstrapPassword == null || bootstrapPassword.isBlank()) {
            log.error("[OpsBootstrap] OPS_BOOTSTRAP_EMAIL is set but OPS_BOOTSTRAP_PASSWORD is not — "
                    + "refusing to create an ops admin without a password.");
            return;
        }

        String email = bootstrapEmail.trim();
        if (opsUserRepository.existsByEmailIgnoreCase(email)) {
            log.info("[OpsBootstrap] ops account '{}' already exists — nothing to do.", email);
            return;
        }

        OpsUser user = new OpsUser();
        user.setEmail(email);
        user.setPasswordHash(opsAuthService.hash(bootstrapPassword));
        user.setName("Ops Admin");
        user.setActive(true);
        user.setCreatedBy("BOOTSTRAP");
        Set<String> roles = new LinkedHashSet<>();
        roles.add(OpsRole.OPS_ADMIN.name()); // seeded as a built-in role by migration V9
        user.setRoles(roles);
        opsUserRepository.save(user);

        log.info("[OpsBootstrap] created first ops account '{}' with OPS_ADMIN.", email);
        log.warn("[OpsBootstrap] OPS_BOOTSTRAP_PASSWORD was read from the environment — change this "
                + "password on first login and clear the env var. MFA is enforced on ops login, so "
                + "this account also needs a reachable email/phone for its one-time codes.");
    }
}
