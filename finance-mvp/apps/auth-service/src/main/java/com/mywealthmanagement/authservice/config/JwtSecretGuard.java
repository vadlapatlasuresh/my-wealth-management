package com.mywealthmanagement.authservice.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * Defense-in-depth: refuse to start the token issuer with the bundled demo JWT
 * secret (or a weak one) outside the {@code dev}/{@code test} profiles.
 * <p>
 * The prod profile already requires {@code JWT_SECRET} (no default), but this
 * guards the remaining footgun — booting a prod-like environment on the default
 * profile, where the demo secret would silently sign real tokens. auth-service
 * is the canary: every other service validates with the same shared secret, so
 * stopping the issuer here surfaces the misconfiguration loudly.
 */
@Component
public class JwtSecretGuard {

    private static final Logger log = LoggerFactory.getLogger(JwtSecretGuard.class);

    /** The public demo default shipped in application.properties. Never valid in prod. */
    private static final String DEMO_SECRET =
            "THIS_IS_A_VERY_LONG_AND_SECURE_SECRET_KEY_FOR_JWT_AUTHENTICATION_DEMO_PURPOSES_ONLY_REPLACE_IN_PRODUCTION";

    private static final int MIN_SECRET_LENGTH = 32;

    private final String jwtSecret;
    private final Environment environment;

    public JwtSecretGuard(@Value("${jwt.secret:}") String jwtSecret, Environment environment) {
        this.jwtSecret = jwtSecret;
        this.environment = environment;
    }

    @PostConstruct
    public void verify() {
        boolean nonProdProfile = Arrays.stream(environment.getActiveProfiles())
                .anyMatch(p -> p.equalsIgnoreCase("dev") || p.equalsIgnoreCase("test") || p.equalsIgnoreCase("local"));
        if (nonProdProfile) {
            return; // demo secret is fine for local/dev/test
        }
        if (jwtSecret == null || jwtSecret.isBlank()) {
            fail("JWT secret is not set. Provide a strong JWT_SECRET (openssl rand -base64 48).");
        }
        if (DEMO_SECRET.equals(jwtSecret)) {
            fail("Refusing to run with the public demo JWT secret. Set a unique JWT_SECRET for this environment.");
        }
        if (jwtSecret.length() < MIN_SECRET_LENGTH) {
            fail("JWT secret is too short (" + jwtSecret.length() + " chars). Use at least " + MIN_SECRET_LENGTH + ".");
        }
        log.info("JWT secret check passed (length {} chars).", jwtSecret.length());
    }

    private void fail(String message) {
        log.error("FATAL: {}", message);
        throw new IllegalStateException(message);
    }
}
