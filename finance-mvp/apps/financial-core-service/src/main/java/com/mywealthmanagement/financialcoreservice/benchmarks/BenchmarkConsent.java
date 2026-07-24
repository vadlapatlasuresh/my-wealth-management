package com.mywealthmanagement.financialcoreservice.benchmarks;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * A user's explicit consent to SEE benchmark comparisons, plus the coarse cohort they picked.
 * Holds no financial values — see V15__benchmark_opt_in.sql for why that matters.
 */
@Entity
@Table(name = "benchmark_consent")
@Data
@NoArgsConstructor
public class BenchmarkConsent {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "opted_in", nullable = false)
    private boolean optedIn = false;

    @Column(name = "age_band")
    private String ageBand;

    @Column(name = "income_band")
    private String incomeBand;

    @Column(name = "region")
    private String region;

    @Column(name = "consented_at")
    private LocalDateTime consentedAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void touch() {
        this.updatedAt = LocalDateTime.now();
    }
}
