package com.mywealthmanagement.financialcoreservice.cpa;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A member's expressed interest in / connection to a CPA. Recorded when a member taps
 * "Connect"; gates who may leave a review. Unique per (cpaId, userId).
 */
@Entity
@Table(name = "cpa_connection")
@Data
@NoArgsConstructor
public class CpaConnection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "cpa_id", nullable = false)
    private Long cpaId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
