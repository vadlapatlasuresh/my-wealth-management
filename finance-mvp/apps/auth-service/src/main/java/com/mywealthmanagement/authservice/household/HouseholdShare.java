package com.mywealthmanagement.authservice.household;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * An explicit grant: "I share THIS resource of mine with my household."
 *
 * <p>Deliberately a registry entry, not a copy: it records what was shared and by whom, never the
 * resource's values. Nothing becomes visible because a household exists — only because a row like
 * this was created, and deleting it revokes access immediately.
 */
@Entity
@Table(name = "household_share")
@Data
@NoArgsConstructor
public class HouseholdShare {

    /** v1 supports sharing linked accounts; the type column leaves room for goals, properties… */
    public static final String TYPE_ACCOUNT = "ACCOUNT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "household_id", nullable = false)
    private Long householdId;

    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    @Column(name = "resource_type", nullable = false)
    private String resourceType;

    @Column(name = "resource_id", nullable = false)
    private String resourceId;

    @Column(name = "label")
    private String label;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
