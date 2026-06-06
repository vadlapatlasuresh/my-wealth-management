package com.mywealthmanagement.apigateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.util.Arrays;
import java.util.Collections;

@SpringBootApplication
public class ApiGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(ApiGatewayApplication.class, args);
    }

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
                .route("auth_service_route", r -> r.path("/api/v1/auth/**")
                        .uri("http://localhost:8081")) // Route to auth-service
                .route("account_aggregation_service_route", r -> r.path("/api/v1/aggregation/**")
                        .uri("http://localhost:8082")) // Route to account-aggregation-service
                .route("financial_core_service_me_route", r -> r.path("/api/v1/me/**")
                        .uri("http://localhost:8083")) // Route to financial-core-service for snapshot
                .route("financial_core_service_planning_route", r -> r.path("/api/v1/planning/**")
                        .uri("http://localhost:8083")) // Route to financial-core-service for planning
                .route("legacy_node_api_route", r -> r.path("/v1/**")
                        .uri("http://localhost:4000")) // Route to legacy Node.js API
                .build();
    }

    @Bean
    public CorsWebFilter corsWebFilter() {
        CorsConfiguration corsConfig = new CorsConfiguration();
        corsConfig.setAllowedOrigins(Arrays.asList("http://localhost:5173", "http://localhost:8080"));
        corsConfig.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        corsConfig.setAllowedHeaders(Collections.singletonList("*"));
        corsConfig.setAllowCredentials(true);
        corsConfig.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", corsConfig);

        return new CorsWebFilter(source);
    }

    // Custom WebFilter to remove duplicate Access-Control-Allow-Origin header
    @Bean
    public WebFilter removeDuplicateCorsHeaderFilter() {
        return (exchange, chain) -> {
            return chain.filter(exchange).doFinally(signalType -> {
                exchange.getResponse().getHeaders().remove("Access-Control-Allow-Origin");
            });
        };
    }
}
