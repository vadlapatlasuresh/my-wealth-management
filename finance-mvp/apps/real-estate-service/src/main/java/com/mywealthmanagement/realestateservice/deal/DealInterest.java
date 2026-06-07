package com.mywealthmanagement.realestateservice.deal;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A lead: a person who expressed interest in a {@link Deal}. Captured when an investor
 * clicks "I'm interested" and consents to share their contact details with the deal's
 * owner (the sponsoring LLC/company). The owner can then view these leads for their deal.
 */
@Entity
@Table(name = "deal_interests")
@Data
@NoArgsConstructor
public class DealInterest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "deal_id", nullable = false)
    private Long dealId;

    // The deal owner (sponsor) who receives this lead — denormalized for fast lookup.
    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    // The authenticated user who expressed interest (if any).
    @Column(name = "interested_user_id")
    private Long interestedUserId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, length = 320)
    private String email;

    @Column(length = 40)
    private String phone;

    @Column(length = 2000)
    private String message;

    // Lead status as the sponsor works it: NEW | CONTACTED | COMMITTED | PASSED.
    @Column(nullable = false, length = 20)
    private String status = "NEW";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
