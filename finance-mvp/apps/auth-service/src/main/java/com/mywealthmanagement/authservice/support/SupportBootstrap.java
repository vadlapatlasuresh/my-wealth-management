package com.mywealthmanagement.authservice.support;

import com.mywealthmanagement.authservice.user.Role;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Bootstraps the first support/admin account. If SUPPORT_BOOTSTRAP_EMAIL is set and that user
 * exists, they are granted ADMIN + CARE on startup. This is how you create the very first
 * customer-care user; thereafter an admin grants CARE to others via the support API.
 */
@Component
public class SupportBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SupportBootstrap.class);

    private final UserRepository userRepository;

    @Value("${support.bootstrap.email:}")
    private String bootstrapEmail;

    public SupportBootstrap(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (bootstrapEmail == null || bootstrapEmail.isBlank()) return;
        userRepository.findByEmail(bootstrapEmail.trim()).ifPresentOrElse(user -> {
            Set<Role> roles = new LinkedHashSet<>(user.getRoles() != null ? user.getRoles() : Set.of());
            boolean changed = roles.add(Role.ADMIN) | roles.add(Role.CARE);
            if (changed) {
                user.setRoles(roles);
                userRepository.save(user);
                log.info("[SupportBootstrap] granted ADMIN+CARE to {}", bootstrapEmail);
            }
        }, () -> log.warn("[SupportBootstrap] SUPPORT_BOOTSTRAP_EMAIL set but no user '{}' yet — "
                + "register that account, then restart to promote it.", bootstrapEmail));
    }
}
