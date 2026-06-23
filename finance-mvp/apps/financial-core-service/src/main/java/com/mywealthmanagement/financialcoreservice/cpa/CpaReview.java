package com.mywealthmanagement.financialcoreservice.cpa;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A review a member left for a CPA. Only members who have a {@link CpaConnection} to the CPA
 * may review; those reviews are flagged {@code verified = true}.
 */
@Entity
@Table(name = "cpa_review")
@Data
@NoArgsConstructor
public class CpaReview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "cpa_id", nullable = false)
    private Long cpaId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    // 1..5
    @Column(nullable = false)
    private int rating;

    @Column(length = 1000)
    private String comment;

    // True when the reviewer had a connection to the CPA at the time of review.
    @Column(nullable = false)
    private boolean verified = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
