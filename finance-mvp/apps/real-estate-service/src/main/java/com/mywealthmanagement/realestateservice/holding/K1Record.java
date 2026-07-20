package com.mywealthmanagement.realestateservice.holding;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A Schedule K-1 the user is owed, or has received, for one {@link PrivateHolding} in one
 * tax year.
 *
 * <p>This exists because K-1s are the thing that actually blocks a private-deal investor's
 * tax return: a partnership issues them well after year end — often past April 15 — and a
 * single missing one stops the whole filing. Tracking which are outstanding, and being able
 * to chase the sponsor, is the point of the record.
 *
 * <p>The figure columns are transcribed from a K-1 the user has in hand. They are recorded,
 * never computed or interpreted: this is bookkeeping, not tax advice.
 */
@Entity
@Table(name = "k1_records")
@Data
@NoArgsConstructor
public class K1Record {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "holding_id", nullable = false)
    private Long holdingId;

    // Denormalized so a record can be authorized without loading its holding.
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "tax_year", nullable = false)
    private Integer taxYear;

    /** EXPECTED | RECEIVED | NOT_APPLICABLE */
    @Column(nullable = false, length = 20)
    private String status = "EXPECTED";

    @Column(name = "received_on")
    private LocalDate receivedOn;

    /**
     * The K-1 in the user's Document Center. Stored as the documents-service id rather than
     * a URL so the file stays in the one place that already handles storage, download auth
     * and CPA sharing — the K-1 record points at it instead of owning a second copy.
     */
    @Column(name = "document_id")
    private Long documentId;

    /** The document's label, cached so the ledger can name the file without a second call. */
    @Column(name = "document_name", length = 300)
    private String documentName;

    /** An externally hosted K-1, for anyone who files them somewhere else. */
    @Column(name = "document_url", length = 500)
    private String documentUrl;

    // ---- transcribed from the form, for tax prep ----

    /** Box 1 — ordinary business income (loss). */
    @Column(name = "ordinary_income", precision = 19, scale = 2)
    private BigDecimal ordinaryIncome;

    /** Box 2 — net rental real estate income (loss). The usual one for property deals. */
    @Column(name = "rental_income", precision = 19, scale = 2)
    private BigDecimal rentalIncome;

    /** Box 19 — distributions. */
    @Column(name = "distributions", precision = 19, scale = 2)
    private BigDecimal distributions;

    @Column(length = 500)
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
