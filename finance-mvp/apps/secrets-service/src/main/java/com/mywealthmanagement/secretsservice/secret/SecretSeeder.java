package com.mywealthmanagement.secretsservice.secret;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;

/**
 * On startup, seeds the store from secrets-seed.json: every required secret is created
 * with a PLACEHOLDER value (so the catalog is complete and visible), and the default
 * per-service READ grants are inserted. Idempotent — existing secrets/grants are left
 * untouched, so real values set by an operator are never overwritten.
 *
 * Workflow: deploy → catalog auto-seeded with placeholders → operator rotates each with
 * the real value via POST /admin/secrets/{name}/rotate.
 */
@Component
@RequiredArgsConstructor
public class SecretSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SecretSeeder.class);
    private static final String PLACEHOLDER_PREFIX = "REPLACE_ME::";

    private final SecretService service;
    private final SecretGrantRepository grants;
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void run(ApplicationArguments args) {
        try (InputStream in = new ClassPathResource("secrets-seed.json").getInputStream()) {
            JsonNode root = mapper.readTree(in);
            int created = 0, grantsAdded = 0;

            for (JsonNode s : root.path("secrets")) {
                String name = s.path("name").asText();
                if (name.isBlank() || service.exists(name)) continue;
                service.upsert(new Dtos.SecretWriteRequest(
                        name,
                        s.path("scope").asText(null),
                        s.path("description").asText(null),
                        s.has("rotationDays") ? s.path("rotationDays").asInt() : null,
                        PLACEHOLDER_PREFIX + name));
                created++;
            }

            for (JsonNode g : root.path("grants")) {
                String principal = g.path("principal").asText();
                String scope = g.path("scope").asText();
                String perm = g.path("permission").asText("READ");
                if (principal.isBlank() || scope.isBlank()) continue;
                if (!grants.existsByPrincipalAndScopeAndPermission(principal, scope, perm)) {
                    SecretGrant grant = new SecretGrant();
                    grant.setPrincipal(principal);
                    grant.setScope(scope);
                    grant.setPermission(perm);
                    grants.save(grant);
                    grantsAdded++;
                }
            }
            log.info("[SecretSeeder] catalog seeded: {} new placeholder secrets, {} new grants. "
                    + "Set real values via POST /admin/secrets/{{name}}/rotate.", created, grantsAdded);
        } catch (Exception e) {
            log.warn("[SecretSeeder] seed skipped: {}", e.getMessage());
        }
    }
}
