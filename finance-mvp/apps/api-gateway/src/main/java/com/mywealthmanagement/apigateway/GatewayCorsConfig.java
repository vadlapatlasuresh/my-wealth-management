package com.mywealthmanagement.apigateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
public class GatewayCorsConfig {

    // Comma-separated allowed origin patterns. Defaults to local dev origins; in prod set
    // GATEWAY_CORS_ALLOWED_ORIGINS to the exact web origin(s), e.g. https://app.example.com
    // NEVER use "*" with allowCredentials=true in production.
    @Value("${gateway.cors.allowed-origins:http://localhost:5173,http://localhost:8080}")
    private String allowedOrigins;

    @Bean("gatewayCorsWebFilter")
    public CorsWebFilter corsWebFilter() {

        CorsConfiguration config = new CorsConfiguration();

        List<String> origins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        // allowCredentials=true with a "*" origin is a security hole (browsers reject it,
        // and reflecting it would leak credentials). Fail fast on a misconfigured prod env.
        if (origins.contains("*")) {
            throw new IllegalStateException(
                    "gateway.cors.allowed-origins must list explicit origins (not '*') because "
                            + "credentials are allowed. Set GATEWAY_CORS_ALLOWED_ORIGINS to your web origin(s).");
        }
        config.setAllowedOriginPatterns(origins);
        config.setAllowedMethods(List.of(
                "GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));

        // Explicit allow-list instead of "*": the SPA sends Authorization (Bearer) and
        // Content-Type; the rest are standard browser/preflight headers.
        config.setAllowedHeaders(List.of(
                "Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration("/**", config);

        return new CorsWebFilter(source);
    }
}
