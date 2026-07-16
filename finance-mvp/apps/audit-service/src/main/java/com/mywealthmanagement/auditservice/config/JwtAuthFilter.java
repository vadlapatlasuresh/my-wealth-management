package com.mywealthmanagement.auditservice.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collection;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserDetailsServiceImpl userDetailsService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        String token = null;
        String username = null; // the userId
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
            try {
                username = jwtService.extractUsername(token);
            } catch (Exception ignored) {
                // invalid token → leave unauthenticated; secured endpoints will 401/403
            }
        }

        // The ops/member boundary, enforced both ways: an ops token authenticates ONLY on this
        // service's ops surface, a member token ONLY off it. A mismatch stays unauthenticated
        // (401/403) rather than succeeding as the wrong kind of identity. See OpsTokens.
        if (username != null && SecurityContextHolder.getContext().getAuthentication() == null
                && jwtService.isOpsToken(token) == OpsTokens.isOpsPath(request.getRequestURI())) {
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            if (Boolean.TRUE.equals(jwtService.validateToken(token, userDetails))) {
                UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                        userDetails, token, rolesFromToken(token));
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        }
        filterChain.doFilter(request, response);
    }

    /** Build Spring authorities from the JWT "roles" claim so hasRole(...) works. */
    private Collection<SimpleGrantedAuthority> rolesFromToken(String token) {
        try {
            Object roles = jwtService.extractClaim(token, c -> c.get("roles"));
            if (roles instanceof List<?> list) {
                return list.stream()
                        .map(r -> new SimpleGrantedAuthority("ROLE_" + String.valueOf(r).toUpperCase()))
                        .toList();
            }
        } catch (Exception ignored) { /* no roles → no authorities */ }
        return List.of();
    }
}
