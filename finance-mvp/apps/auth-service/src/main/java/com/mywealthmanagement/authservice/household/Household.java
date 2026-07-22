package com.mywealthmanagement.authservice.household;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/** A household: the container two or more people share. Owns nothing personal by itself. */
@Entity
@Table(name = "household")
@Data
@NoArgsConstructor
public class Household {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "created_by_user_id", nullable = false)
    private Long createdByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
