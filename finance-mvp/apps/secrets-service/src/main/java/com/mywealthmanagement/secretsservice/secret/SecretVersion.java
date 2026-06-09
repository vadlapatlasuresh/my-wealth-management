package com.mywealthmanagement.secretsservice.secret;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/** One encrypted version of a secret value. Envelope: ciphertext + the KEK-wrapped DEK. */
@Entity
@Table(name = "secret_version",
        uniqueConstraints = @UniqueConstraint(columnNames = {"secret_id", "version"}))
@Getter
@Setter
public class SecretVersion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "secret_id", nullable = false)
    private Long secretId;

    @Column(nullable = false)
    private Integer version;

    /** Base64( IV ‖ ciphertext ‖ GCM tag ) of the secret value, under the DEK. */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String ciphertext;

    /** KEK-wrapped DEK used for this version. */
    @Column(name = "wrapped_dek", nullable = false, columnDefinition = "TEXT")
    private String wrappedDek;

    /** ACTIVE | PREVIOUS | RETIRED. */
    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
