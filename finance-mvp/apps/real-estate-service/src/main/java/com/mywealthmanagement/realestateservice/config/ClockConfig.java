package com.mywealthmanagement.realestateservice.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * A system clock as a bean, so date-sensitive logic can be tested at a fixed instant.
 *
 * <p>K-1 tracking needs this: whether a form is "overdue" depends on today's date relative
 * to the filing deadline, and a test that only passes for part of the year is worse than no
 * test at all.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemDefaultZone();
    }
}
