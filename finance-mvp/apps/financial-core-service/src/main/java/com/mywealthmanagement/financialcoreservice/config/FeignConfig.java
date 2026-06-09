package com.mywealthmanagement.financialcoreservice.config;

import feign.RequestInterceptor;
import org.slf4j.MDC;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Configuration
public class FeignConfig {

    @Bean
    public RequestInterceptor requestInterceptor() {
        return requestTemplate -> {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                String authorizationHeader = attributes.getRequest().getHeader("Authorization");
                if (authorizationHeader != null && !authorizationHeader.isEmpty()) {
                    requestTemplate.header("Authorization", authorizationHeader);
                }
            }
            // Forward the correlation id onto downstream service calls so a single
            // request id traces through every inter-service hop, not just the gateway.
            String requestId = MDC.get("requestId");
            if (requestId != null && !requestId.isBlank()) {
                requestTemplate.header("X-Request-Id", requestId);
            }
        };
    }
}
