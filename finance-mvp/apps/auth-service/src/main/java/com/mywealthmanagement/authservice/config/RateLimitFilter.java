package com.mywealthmanagement.authservice.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-IP fixed-window rate limiter for the unauthenticated auth/OTP endpoints
 * (login, register, MFA verify, email/SMS OTP). Defends against brute-force
 * password guessing and OTP enumeration.
 * <p>
 * In-memory and per-instance — fine for the current single-VM deployment. For a
 * multi-instance setup, move the counters to Redis (or limit at the gateway).
 * Client IP is taken from {@code X-Forwarded-For} (set by Caddy/gateway) and
 * falls back to the socket address.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    @Value("${auth.ratelimit.enabled:true}")
    private boolean enabled;

    @Value("${auth.ratelimit.requests:10}")
    private int maxRequests;

    @Value("${auth.ratelimit.window-seconds:60}")
    private int windowSeconds;

    /** Exact request URIs (POST only) that are rate-limited. */
    private static final Set<String> LIMITED_PATHS = Set.of(
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/v1/auth/mfa/verify",
            "/api/v1/auth/email/send",
            "/api/v1/auth/email/verify",
            "/api/v1/auth/sms/send",
            "/api/v1/auth/sms/verify");

    // ip -> [windowStartMillis, count]; mutated atomically via compute().
    private final ConcurrentHashMap<String, long[]> windows = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        if (!enabled
                || !"POST".equalsIgnoreCase(request.getMethod())
                || !LIMITED_PATHS.contains(request.getRequestURI())) {
            chain.doFilter(request, response);
            return;
        }

        String ip = clientIp(request);
        if (overLimit(ip)) {
            log.warn("rate-limit: {} exceeded {} requests / {}s on {}",
                    ip, maxRequests, windowSeconds, request.getRequestURI());
            response.setStatus(429); // Too Many Requests
            response.setHeader("Retry-After", String.valueOf(windowSeconds));
            response.setContentType("application/json");
            response.getWriter().write(
                    "{\"error\":\"rate_limited\",\"message\":\"Too many attempts. Please try again later.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private boolean overLimit(String ip) {
        long now = System.currentTimeMillis();
        long windowMs = windowSeconds * 1000L;

        // Bound memory: occasionally evict expired windows.
        if (windows.size() > 10_000) {
            windows.entrySet().removeIf(e -> now - e.getValue()[0] > windowMs);
        }

        long[] window = windows.compute(ip, (k, v) -> {
            if (v == null || now - v[0] >= windowMs) {
                return new long[]{now, 1};
            }
            v[1]++;
            return v;
        });
        return window[1] > maxRequests;
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        return request.getRemoteAddr();
    }
}
