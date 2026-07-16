package com.mywealthmanagement.documentsservice.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Boot-time secrets fetch from the centralized secrets-service. Identical shim used
 * by every service (see SECRET_MANAGEMENT_DESIGN.md §10). Activates only when
 * SECRETS_URI and SECRETS_SCOPES are set, so local dev keeps resolving from env/.env.
 */
public class SecretsEnvironmentPostProcessor implements EnvironmentPostProcessor {

    private static final String SOURCE = "secrets-store";
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication app) {
        String base = env.getProperty("SECRETS_URI");
        String scopes = env.getProperty("SECRETS_SCOPES");
        if (base == null || base.isBlank() || scopes == null || scopes.isBlank()) {
            return; // not configured → use existing environment (dev unchanged)
        }
        String principal = env.getProperty("spring.application.name", "unknown-service");
        String internalKey = env.getProperty("SECRETS_INTERNAL_KEY", "dev-internal-secrets-key");

        Map<String, Object> resolved = new HashMap<>();
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

        for (String scope : scopes.split(",")) {
            scope = scope.trim();
            if (scope.isEmpty()) continue;
            try {
                HttpRequest req = HttpRequest.newBuilder()
                        .uri(URI.create(base + "/internal/secrets?scope=" + scope))
                        .timeout(Duration.ofSeconds(5))
                        .header("X-Internal-Key", internalKey)
                        .header("X-Service-Id", principal)
                        .GET().build();
                HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() != 200) {
                    System.out.println("[secrets-client] scope '" + scope + "' -> HTTP " + res.statusCode()
                            + " (falling back to environment)");
                    continue;
                }
                Map<?, ?> values = mapper.readValue(res.body(), Map.class);
                values.forEach((k, v) -> {
                    String envKey = String.valueOf(k).toUpperCase().replace('.', '_');
                    if (v != null && !String.valueOf(v).startsWith("REPLACE_ME::")) {
                        resolved.put(envKey, v);
                    }
                });
                System.out.println("[secrets-client] loaded " + values.size() + " secret(s) for scope '" + scope + "'");
            } catch (Exception e) {
                System.out.println("[secrets-client] scope '" + scope + "' fetch failed: " + e.getMessage()
                        + " (falling back to environment)");
            }
        }

        if (!resolved.isEmpty()) {
            env.getPropertySources().addFirst(new SystemEnvironmentPropertySource(SOURCE, resolved));
        }
    }
}
