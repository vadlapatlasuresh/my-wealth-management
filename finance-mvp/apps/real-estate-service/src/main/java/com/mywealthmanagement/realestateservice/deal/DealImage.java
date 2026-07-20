package com.mywealthmanagement.realestateservice.deal;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A property photo attached to a {@link Deal}. The bytes live in object storage; this row
 * holds the pointer and the metadata needed to serve them back.
 *
 * <p>A listing carries at most {@link DealService#MAX_IMAGES} of these — the directory shows
 * what a property looks like, it is not a media host.
 */
@Entity
@Table(name = "deal_images")
@Data
@NoArgsConstructor
public class DealImage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "deal_id", nullable = false)
    private Long dealId;

    // The listing's owner — denormalized so a delete can be authorized without a join.
    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    // Object-storage key. Never exposed to clients; they only ever see /images/{id}.
    @Column(name = "object_name", nullable = false, length = 500)
    private String objectName;

    @Column(name = "content_type", length = 255)
    private String contentType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    // Display order, so the first photo is a deliberate choice rather than an id accident.
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
