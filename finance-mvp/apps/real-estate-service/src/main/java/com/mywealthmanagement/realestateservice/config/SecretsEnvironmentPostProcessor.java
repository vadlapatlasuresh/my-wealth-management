package com.mywealthmanagement.realestateservice.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Boot-time secrets fetch from the centralized secrets-service.
 *
 * Activates only when SECRETS_URI and SECRETS_SCOPES are set, so local dev (which
 * has neither) keeps resolving values from .env.local / environment exactly as before.
 * Fully graceful: any failure logs and falls through to the existing env, so the
 * service never fails to start because the store is briefly unavailable.
 *
 * Secret names are published under their ENV-var name (e.g. gemini.api_key -> GEMINI_API_KEY,
 * realestate.provider_api_key -> REALESTATE_PROVIDER_API_KEY), which is exactly what every
 * service's ${ENV_VAR:default} placeholders bind to — so no per-service property mapping is
 * needed. Fetched values take priority, so removing the env var makes the service read from
 * the store.
 *
 * This is the reusable "secrets-client" shim from SECRET_MANAGEMENT_DESIGN.md §10; the
 * same class can be lifted into every service (or a shared module) unchanged.
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
                    // gemini.api_key -> GEMINI_API_KEY (matches the ${ENV_VAR} placeholders).
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
            // addFirst → fetched secrets win over env defaults for the same key.
            env.getPropertySources().addFirst(new MapPropertySource(SOURCE, resolved));
        }
    }
}
