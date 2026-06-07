package com.mywealthmanagement.platformconfigservice.content;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "disclaimer_acceptance")
@Data
@NoArgsConstructor
public class DisclaimerAcceptance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "disclaimer_key", nullable = false, length = 200)
    private String disclaimerKey;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "accepted_at", nullable = false)
    private LocalDateTime acceptedAt;
}
