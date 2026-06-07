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
