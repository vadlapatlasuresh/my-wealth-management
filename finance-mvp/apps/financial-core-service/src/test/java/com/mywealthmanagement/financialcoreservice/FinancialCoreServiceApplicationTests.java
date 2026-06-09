package com.mywealthmanagement.financialcoreservice;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/** Boots the full context (runs Flyway + wires beans, incl. Feign clients) to validate startup. */
@SpringBootTest
class FinancialCoreServiceApplicationTests {

    @Test
    void contextLoads() {
    }
}
