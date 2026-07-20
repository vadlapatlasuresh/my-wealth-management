package com.mywealthmanagement.realestateservice.deal;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A record that someone requested a {@link Deal} listing's contact details. Written when
 * a viewer clicks "Request Contact Info", purely so they can find the listing again under
 * "My Interests".
 *
 * <p>This is a bookmark, not a lead pipeline. It carries no commitment amount, no investor
 * attestation and no workflow status: the directory does not broker introductions, it just
 * hands over the poster's own email and steps out of the way.
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

    // The listing's owner — denormalized for fast lookup.
    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    // The authenticated user who requested the contact details (if any).
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

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
