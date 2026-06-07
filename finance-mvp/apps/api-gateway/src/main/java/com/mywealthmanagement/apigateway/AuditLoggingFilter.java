package com.mywealthmanagement.apigateway;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.HashMap;
import java.util.Map;

/**
 * Captures EVERY request that flows through the gateway as a user-activity audit event and
 * fire-and-forgets it to the audit-service. This is the single chokepoint that guarantees every
 * user action is tracked. It never blocks or fails the user's request.
 */
@Component
public class AuditLoggingFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(AuditLoggingFilter.class);

    @Value("${audit.enabled:true}")
    private boolean enabled;

    @Value("${audit.uri:http://localhost:8090}")
    private String auditUri;

    @Value("${audit.ingest.key:dev-internal-audit-key}")
    private String ingestKey;

    @Value("${jwt.secret:}")
    private String jwtSecret;

    private final WebClient webClient = WebClient.builder().build();

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        if (!enabled) return chain.filter(exchange);

        final long start = System.currentTimeMillis();
        return chain.filter(exchange).then(Mono.fromRunnable(() -> {
            try {
                send(exchange, start);
            } catch (Exception e) {
                log.debug("audit emit skipped: {}", e.getMessage());
            }
        }));
    }

    private void send(ServerWebExchange exchange, long start) {
        ServerHttpRequest req = exchange.getRequest();
        String path = req.getPath().value();
        String method = req.getMethod() != null ? req.getMethod().name() : "";

        // Don't audit CORS preflight, health probes, or the audit ingest itself.
        if ("OPTIONS".equals(method) || path.startsWith("/actuator") || path.startsWith("/api/v1/audit")) {
            return;
        }

        String userId = extractUserId(req);
        Integer status = exchange.getResponse().getStatusCode() != null
                ? exchange.getResponse().getStatusCode().value() : null;

        Map<String, Object> body = new HashMap<>();
        body.put("userId", userId);
        body.put("actorType", userId != null ? "USER" : "ANONYMOUS");
        body.put("action", method + " " + path);
        body.put("service", serviceFor(path));
        body.put("method", method);
        body.put("path", path);
        body.put("status", status);
        body.put("sourceIp", clientIp(req));
        body.put("userAgent", req.getHeaders().getFirst("User-Agent"));
        body.put("latencyMs", (int) (System.currentTimeMillis() - start));
        body.put("outcome", (status != null && status >= 400) ? "FAILURE" : "SUCCESS");

        webClient.post()
                .uri(auditUri + "/api/v1/audit/events")
                .header("X-Internal-Key", ingestKey)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(Void.class)
                .subscribe(v -> {}, err -> log.debug("audit post failed: {}", err.getMessage()));
    }

    /** Decode (and validate) the bearer token to read the userId (subject). Null if absent/invalid. */
    private String extractUserId(ServerHttpRequest req) {
        String auth = req.getHeaders().getFirst("Authorization");
        if (auth == null || !auth.startsWith("Bearer ") || jwtSecret == null || jwtSecret.isEmpty()) {
            return null;
        }
        try {
            Key key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
            return Jwts.parserBuilder().setSigningKey(key).build()
                    .parseClaimsJws(auth.substring(7)).getBody().getSubject();
        } catch (Exception e) {
            return null; // invalid/expired token → treat as anonymous
        }
    }

    private String clientIp(ServerHttpRequest req) {
        String xff = req.getHeaders().getFirst("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return req.getRemoteAddress() != null ? req.getRemoteAddress().getAddress().getHostAddress() : null;
    }

    /** Coarse service name from the path prefix (for filtering in the audit UI). */
    private String serviceFor(String path) {
        if (path.startsWith("/api/v1/auth")) return "auth";
        if (path.startsWith("/api/v1/aggregation")) return "account-aggregation";
        if (path.startsWith("/api/v1/me") || path.startsWith("/api/v1/planning")) return "financial-core";
        if (path.startsWith("/api/v1/real-estate")) return "real-estate";
        if (path.startsWith("/api/v1/business")) return "business-financials";
        if (path.startsWith("/api/v1/ai")) return "ai-insights";
        if (path.startsWith("/api/v1/payments")) return "payment";
        if (path.startsWith("/api/v1/notifications")) return "notification";
        if (path.startsWith("/api/v1/config") || path.startsWith("/api/v1/content")) return "platform-config";
        return "gateway";
    }

    @Override
    public int getOrder() {
        // Run first so latency spans the whole chain and the post runs after routing completes.
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
