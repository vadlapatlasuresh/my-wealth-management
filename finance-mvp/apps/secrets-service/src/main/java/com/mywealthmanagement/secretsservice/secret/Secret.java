package com.mywealthmanagement.secretsservice.secret;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** A named secret (e.g. "stripe.secret_key"). Values live in {@link SecretVersion}. */
@Entity
@Table(name = "secret")
@Getter
@Setter
public class Secret {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 200)
    private String name;

    /** Coarse scope used for grants, e.g. "stripe", "jwt", "db.payment". */
    @Column(nullable = false, length = 100)
    private String scope;

    @Column(length = 500)
    private String description;

    /** null = manual rotation only; else rotate-after-N-days for the rotation-due check. */
    @Column(name = "rotation_days")
    private Integer rotationDays;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
