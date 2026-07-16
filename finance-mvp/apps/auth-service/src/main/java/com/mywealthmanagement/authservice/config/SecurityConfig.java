package com.mywealthmanagement.authservice.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpMethod;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
// Turns on @PreAuthorize. Without this the annotations on the ops endpoints are inert decoration
// and every authenticated ops token would pass every permission check.
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final UserDetailsServiceImpl userDetailsService;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf().disable()
                .authorizeHttpRequests()
                // Profile read/update + self-deletion must be authenticated (matched before the broad permitAll).
                .requestMatchers(HttpMethod.GET, "/api/v1/auth/me").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/v1/auth/me/export").authenticated()
                .requestMatchers(HttpMethod.PUT, "/api/v1/auth/me").authenticated()
                .requestMatchers(HttpMethod.DELETE, "/api/v1/auth/me").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/password/change").authenticated() // change while signed in
                .requestMatchers("/api/v1/auth/**").permitAll() // login/register/mfa/email/forgot/policy are public
                .requestMatchers("/error").permitAll() // don't let error-dispatch mask 500s as 403
                .requestMatchers("/actuator/**").permitAll()
                .requestMatchers("/internal/**").permitAll() // server-to-server; guarded by X-Internal-Key
                // --- Ops surface: reachable ONLY with a typ=ops token (enforced in JwtAuthFilter,
                // which refuses to authenticate a member token here and an ops token anywhere else).
                //
                // Authorisation beyond "is authenticated" is deliberately NOT expressed here.
                // Each ops endpoint declares its own @PreAuthorize("hasAuthority('...')") next to
                // the code it protects, because a path matcher in a config file drifts from the
                // handlers it guards the moment someone adds a route.
                .requestMatchers("/api/v1/ops/auth/login", "/api/v1/ops/auth/mfa/verify").permitAll()
                .requestMatchers("/api/v1/support/**").authenticated()
                .requestMatchers("/api/v1/ops/**").authenticated()
                .anyRequest().authenticated() // All other requests require authentication
                .and()
                .sessionManagement()
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS) // Use stateless sessions for JWT
                .and()
                .authenticationProvider(authenticationProvider())
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class); // Add JWT filter

        return http.build();
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider authenticationProvider = new DaoAuthenticationProvider();
        authenticationProvider.setUserDetailsService(userDetailsService);
        authenticationProvider.setPasswordEncoder(passwordEncoder());
        return authenticationProvider;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
