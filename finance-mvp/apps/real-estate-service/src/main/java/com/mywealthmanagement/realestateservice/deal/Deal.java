package com.mywealthmanagement.realestateservice.deal;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * A listing on the passive property directory: a physical property a user has posted
 * so others can find it and contact them off-platform.
 *
 * <p>Deliberately carries no financial terms — no returns, yields, IRR, minimum entry,
 * raise target or committed amounts. The directory is informational only: it does not
 * vet listings, give advice, or facilitate any transaction, so it must not store or
 * publish the numbers that would make it look like it does. See {@link DealService}.
 */
@Entity
@Table(name = "deals")
@Data
@NoArgsConstructor
public class Deal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 200)
    private String title;

    // REAL_ESTATE | BUSINESS | OTHER
    @Column(nullable = false, length = 40)
    private String category;

    // Descriptive property type, e.g. MULTIFAMILY / LAND / COMMERCIAL / MIXED_USE.
    @Column(length = 40)
    private String subcategory;

    // Free text describing the physical property.
    @Column(length = 2000)
    private String description;

    @Column(length = 200)
    private String location;

    // Property photos live in the deal_images table (bytes in object storage), not here.

    // Required external link. Every listing sends people off this domain entirely —
    // to the poster's own site or their own legal offering portal.
    @Column(name = "website_url", nullable = false, length = 500)
    private String websiteUrl;

    // Where inquiries go. Surfaced to viewers as a mailto:/tel: link so the conversation
    // happens directly between the two parties, off-platform.
    @Column(name = "contact_email", length = 320)
    private String contactEmail;

    @Column(name = "contact_phone", length = 40)
    private String contactPhone;

    // DRAFT | OPEN | CLOSED
    @Column(nullable = false, length = 20)
    private String status;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
