package com.mywealthmanagement.auditservice.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf().disable()
                .authorizeHttpRequests()
                .requestMatchers("/error").permitAll()
                .requestMatchers("/actuator/**").permitAll()
                // Internal endpoints are guarded by the X-Internal-Key header in the controller
                // (and network isolation), not by JWT — the gateway/services call these.
                .requestMatchers(HttpMethod.POST, "/api/v1/audit/events").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/audit/users/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/audit/events").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/audit/verify").permitAll()
                // The access-record queries ("who touched customer X", "what did agent Y do").
                // Internal-key guarded like the rest: auth-service fronts them for the ops portal
                // and applies the audit.query permission there, so the ops-facing check lives with
                // the ops identity rather than being duplicated here.
                .requestMatchers(HttpMethod.GET, "/api/v1/audit/target/**").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/audit/actor/**").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/audit/checkpoints").permitAll()
                // Operator analytics + the system health/alerts feed. These are the only routes
                // here reached with an ops JWT (see OpsTokens), gated on the permission rather
                // than a role list so retuning a role in the DB doesn't need a deploy.
                .requestMatchers(HttpMethod.GET, "/api/v1/audit/stats").hasAuthority("ops.analytics.view")
                .requestMatchers(HttpMethod.GET, "/api/v1/audit/health/**").hasAuthority("ops.analytics.view")
                // Remaining endpoints (e.g. /me) require a valid user JWT.
                .anyRequest().authenticated()
                .and()
                .sessionManagement()
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                .and()
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
