package com.mywealthmanagement.authservice.household;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/** Membership of a user in a household. ACTIVE membership is the ONLY thing that grants access. */
@Entity
@Table(name = "household_member")
@Data
@NoArgsConstructor
public class HouseholdMember {

    public static final String ROLE_OWNER = "OWNER";
    public static final String ROLE_MEMBER = "MEMBER";
    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_LEFT = "LEFT";
    public static final String STATUS_REMOVED = "REMOVED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "household_id", nullable = false)
    private Long householdId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false)
    private String status;

    @CreationTimestamp
    @Column(name = "joined_at", updatable = false)
    private LocalDateTime joinedAt;

    @Column(name = "left_at")
    private LocalDateTime leftAt;

    /**
     * Mirrors {@link #userId} while this membership is ACTIVE and is NULL otherwise. A plain
     * UNIQUE constraint on it therefore enforces "at most one ACTIVE household per user" at the
     * DATABASE level, because both PostgreSQL and H2 allow many NULLs in a unique column.
     *
     * <p>This replaces a partial unique index (`WHERE status = 'ACTIVE'`), which is
     * PostgreSQL-only and broke every @SpringBootTest when Flyway ran it against H2.
     * Maintained by the JPA callback below so application code cannot forget to update it.
     */
    @Column(name = "active_user_id")
    private Long activeUserId;

    @PrePersist
    @PreUpdate
    void syncActiveUserId() {
        this.activeUserId = STATUS_ACTIVE.equals(status) ? userId : null;
    }

    public boolean isActive() {
        return STATUS_ACTIVE.equals(status);
    }

    public boolean isOwner() {
        return ROLE_OWNER.equals(role);
    }
}
