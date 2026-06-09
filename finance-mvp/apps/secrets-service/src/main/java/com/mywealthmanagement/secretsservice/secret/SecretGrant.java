package com.mywealthmanagement.secretsservice.secret;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

/** Least-privilege grant: which calling service may read/write/rotate which scope. */
@Entity
@Table(name = "secret_grant",
        uniqueConstraints = @UniqueConstraint(columnNames = {"principal", "scope", "permission"}))
@Getter
@Setter
public class SecretGrant {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Calling service identity, e.g. "payment-service". */
    @Column(nullable = false, length = 120)
    private String principal;

    /** Scope the principal may access, e.g. "stripe" → may read stripe.*. */
    @Column(nullable = false, length = 100)
    private String scope;

    /** READ | WRITE | ROTATE. */
    @Column(nullable = false, length = 20)
    private String permission;
}
