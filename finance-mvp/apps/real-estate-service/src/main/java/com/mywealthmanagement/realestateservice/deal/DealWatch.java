package com.mywealthmanagement.realestateservice.deal;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A "saved"/watchlisted deal for an investor. Unique per (user, deal).
 */
@Entity
@Table(name = "deal_watches", uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "deal_id"}))
@Data
@NoArgsConstructor
public class DealWatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "deal_id", nullable = false)
    private Long dealId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
