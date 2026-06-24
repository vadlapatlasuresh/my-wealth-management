package com.mywealthmanagement.apigateway;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class ApiGatewayApplication {

    // Downstream service URIs are externalized so the SAME jar runs locally (localhost defaults)
    // and in Docker Compose / prod (override via SERVICE_*_URI env vars, e.g. http://auth-service:8081).
    @Value("${service.auth.uri:http://localhost:8081}")
    private String authUri;
    @Value("${service.aggregation.uri:http://localhost:8082}")
    private String aggregationUri;
    @Value("${service.financial-core.uri:http://localhost:8083}")
    private String financialCoreUri;
    @Value("${service.real-estate.uri:http://localhost:8084}")
    private String realEstateUri;
    @Value("${service.business.uri:http://localhost:8085}")
    private String businessUri;
    @Value("${service.ai.uri:http://localhost:8086}")
    private String aiUri;
    @Value("${service.payment.uri:http://localhost:8087}")
    private String paymentUri;
    @Value("${service.notification.uri:http://localhost:8088}")
    private String notificationUri;
    @Value("${service.platform-config.uri:http://localhost:8089}")
    private String platformConfigUri;
    @Value("${service.audit.uri:http://localhost:8090}")
    private String auditUri;

    public static void main(String[] args) {
        SpringApplication.run(ApiGatewayApplication.class, args);
    }

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
                .route("auth_service_route", r -> r.path("/api/v1/auth/**")
                        .uri(authUri)) // Route to auth-service
                .route("support_service_route", r -> r.path("/api/v1/support/**")
                        .uri(authUri)) // Route to auth-service (customer-care / role management)
                .route("account_aggregation_service_route", r -> r.path("/api/v1/aggregation/**")
                        .uri(aggregationUri)) // Route to account-aggregation-service
                .route("financial_core_service_me_route", r -> r.path("/api/v1/me/**")
                        .uri(financialCoreUri)) // Route to financial-core-service for snapshot
                .route("financial_core_service_planning_route", r -> r.path("/api/v1/planning/**")
                        .uri(financialCoreUri)) // Route to financial-core-service for planning
                .route("financial_core_service_cpa_route", r -> r.path("/api/v1/cpa/**")
                        .uri(financialCoreUri)) // Route to financial-core-service for the CPA marketplace
                .route("financial_core_service_invest_route", r -> r.path("/api/v1/invest/**")
                        .uri(financialCoreUri)) // Route to financial-core-service for invest holdings
                .route("real_estate_service_route", r -> r.path("/api/v1/real-estate/**")
                        .uri(realEstateUri)) // Route to real-estate-service
                .route("deals_service_route", r -> r.path("/api/v1/deals/**")
                        .uri(realEstateUri)) // Route to real-estate-service (deals feature)
                .route("sponsor_service_route", r -> r.path("/api/v1/sponsor/**")
                        .uri(realEstateUri)) // Route to real-estate-service (sponsor track record)
                .route("business_financials_service_route", r -> r.path("/api/v1/business/**")
                        .uri(businessUri)) // Route to business-financials-service
                .route("ai_insights_service_route", r -> r.path("/api/v1/ai/**")
                        .uri(aiUri)) // Route to ai-insights-service
                .route("payment_service_route", r -> r.path("/api/v1/payments/**")
                        .uri(paymentUri)) // Route to payment-service
                .route("notification_service_route", r -> r.path("/api/v1/notifications/**")
                        .uri(notificationUri)) // Route to notification-service
                .route("platform_config_route", r -> r.path("/api/v1/config/**")
                        .uri(platformConfigUri)) // Route to platform-config-service
                .route("content_service_route", r -> r.path("/api/v1/content/**")
                        .uri(platformConfigUri)) // Route to platform-config-service (disclaimer content)
                .route("audit_service_route", r -> r.path("/api/v1/audit/**")
                        .uri(auditUri)) // Route to audit-service (activity log query APIs)
                .build();
    }
}
