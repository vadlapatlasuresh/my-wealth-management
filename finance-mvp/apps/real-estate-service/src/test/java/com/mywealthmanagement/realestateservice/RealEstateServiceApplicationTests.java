package com.mywealthmanagement.realestateservice;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Boots the full Spring context against the dev H2 database. This runs every Flyway
 * migration (V1–V7) and wires every bean, so a broken migration or DI failure fails here
 * instead of only at deploy time.
 */
@SpringBootTest
class RealEstateServiceApplicationTests {

    @Test
    void contextLoads() {
    }
}
