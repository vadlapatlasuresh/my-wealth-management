package com.mywealthmanagement.realestateservice.sponsor;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * A property the user has listed before — one entry of their directory history. Descriptive
 * only: it deliberately records no outcome or performance figure. Owned by the user and
 * reusable across all of their deals; investors viewing a deal can see the sponsor's
 * past projects to vet them.
 */
@Entity
@Table(name = "sponsor_projects")
@Data
@NoArgsConstructor
public class SponsorProject {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 2000)
    private String description;

    @Column(length = 500)
    private String url;

    @Column(length = 200)
    private String location;

    // Column is "project_year" because YEAR is a reserved word in H2.
    @Column(name = "project_year")
    private Integer year;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
