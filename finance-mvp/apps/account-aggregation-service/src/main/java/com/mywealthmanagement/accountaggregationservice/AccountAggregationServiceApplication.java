package com.mywealthmanagement.accountaggregationservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling // enables the periodic Plaid transaction sync (real-time freshness)
public class AccountAggregationServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(AccountAggregationServiceApplication.class, args);
    }

}
