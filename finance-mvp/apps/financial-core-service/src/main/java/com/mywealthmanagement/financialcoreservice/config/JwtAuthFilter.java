package com.mywealthmanagement.financialcoreservice.config;

import com.mywealthmanagement.financialcoreservice.config.JwtService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
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
        String username = null; // This will be the userId
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
            try {
                username = jwtService.extractUsername(token);
            } catch (Exception ignored) {
                // malformed/expired token -> leave unauthenticated (401 via entry point), never 500
            }
        }

        // The ops/member boundary, enforced both ways: an ops token authenticates ONLY on this
        // service's ops surface, a member token ONLY off it. A mismatch stays unauthenticated
        // (401/403) rather than succeeding as the wrong kind of identity. See OpsTokens.
        if (username != null && SecurityContextHolder.getContext().getAuthentication() == null
                && jwtService.isOpsToken(token) == OpsTokens.isOpsPath(request.getRequestURI())) {
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            if (jwtService.validateToken(token, userDetails)) {
                // Carry the DB-derived authorities plus the JWT's roles (as ROLE_*), so
                // downstream code can authorize admin/care actions. Additive — the principal
                // name stays the numeric userId, so existing userId extraction is unaffected.
                List<GrantedAuthority> authorities = new ArrayList<>(userDetails.getAuthorities());
                for (String role : jwtService.extractRoles(token)) {
                    String r = role == null ? "" : role.trim().toUpperCase();
                    if (!r.isEmpty()) {
                        authorities.add(new SimpleGrantedAuthority(r.startsWith("ROLE_") ? r : "ROLE_" + r));
                    }
                }
                UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                        userDetails, token, authorities);
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        }
        filterChain.doFilter(request, response);
    }
}
