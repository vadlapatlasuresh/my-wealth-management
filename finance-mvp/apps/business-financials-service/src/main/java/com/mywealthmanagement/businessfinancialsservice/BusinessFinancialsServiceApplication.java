package com.mywealthmanagement.businessfinancialsservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling // drives RecurringInvoiceJob (daily recurring-invoice generator)
public class BusinessFinancialsServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(BusinessFinancialsServiceApplication.class, args);
    }

}
