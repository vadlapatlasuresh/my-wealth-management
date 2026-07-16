package com.mywealthmanagement.authservice.config;

import com.mywealthmanagement.authservice.auth.JwtService;
import com.mywealthmanagement.authservice.ops.OpsTokens;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        String token = null;
        String userId = null; // JWT subject is the userId
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
            try {
                userId = jwtService.extractUsername(token);
            } catch (Exception ignored) {
                // invalid token → stay unauthenticated
            }
        }

        if (userId != null && SecurityContextHolder.getContext().getAuthentication() == null
                && jwtService.isTokenValid(token)
                && tokenTypeMatchesSurface(token, request.getRequestURI())) {
            // Authorities come from the JWT roles claim — member tokens carry customer roles
            // (USER), ops tokens carry OpsRole values (OPS_AGENT, …). Not a DB lookup.
            // The subject is the userId for member tokens, the ops_users id for ops tokens.
            List<SimpleGrantedAuthority> authorities = jwtService.extractRoles(token).stream()
                    .map(r -> new SimpleGrantedAuthority("ROLE_" + r))
                    .toList();
            UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(userId, null, authorities);
            authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authToken);
        }
        filterChain.doFilter(request, response);
    }

    /**
     * The ops/member boundary, enforced in BOTH directions:
     *   - an ops token authenticates ONLY on the ops surface (/api/v1/ops/**, /api/v1/support/**)
     *   - a member token authenticates ONLY off it
     *
     * A mismatch leaves the request unauthenticated, so it fails as 401/403 rather than
     * succeeding with the wrong kind of identity. Both directions matter: without the first,
     * an agent's ops token would read and write member data as if it were the customer's own;
     * without the second, any customer holding a valid member token could reach the ops surface
     * and only a role check would stand between them and every customer record.
     */
    private boolean tokenTypeMatchesSurface(String token, String path) {
        return jwtService.isOpsToken(token) == OpsTokens.isOpsPath(path);
    }
}
