package com.mywealthmanagement.financialcoreservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableFeignClients // Enable Feign clients for inter-service communication
@EnableScheduling   // Weekly net-worth digest job (WeeklySummaryJob)
public class FinancialCoreServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(FinancialCoreServiceApplication.class, args);
    }

}
