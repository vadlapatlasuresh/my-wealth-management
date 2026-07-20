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
 * A private co-ownership position the user already holds — typically membership units in a
 * property-holding LLC, bought directly from the sponsor, off this platform.
 *
 * <p>This is a <strong>record of something the user owns</strong>, in the same family as the
 * property and business trackers. TerraVest does not sell these interests, does not value
 * them, and is not a party to them: the user enters what they subscribed for and what they
 * have since been paid. Nothing here is an offer, and no field describes a projected return
 * on an interest that is still for sale — see the Deal Room's compliance posture, which this
 * feature is deliberately built to stay inside.
 */
@Entity
@Table(name = "private_holdings")
@Data
@NoArgsConstructor
public class PrivateHolding {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** The legal entity, e.g. "Cedar Ridge Land LLC". */
    @Column(nullable = false, length = 200)
    private String name;

    /** LLC | LP | JV | SYNDICATION | FUND | OTHER */
    @Column(name = "entity_type", nullable = false, length = 30)
    private String entityType;

    /** Descriptive property type, reusing the directory's vocabulary. */
    @Column(name = "asset_type", length = 40)
    private String assetType;

    @Column(length = 200)
    private String location;

    /** Who runs the entity. Tracked so the user can see their exposure per sponsor. */
    @Column(name = "sponsor_name", length = 200)
    private String sponsorName;

    @Column(name = "sponsor_contact", length = 320)
    private String sponsorContact;

    /** The sponsor's own page for the deal. */
    @Column(name = "external_url", length = 500)
    private String externalUrl;

    /** Units the user holds, and the entity's total, so ownership % is derivable. */
    @Column(name = "units_held", precision = 19, scale = 4)
    private BigDecimal unitsHeld;

    @Column(name = "total_units", precision = 19, scale = 4)
    private BigDecimal totalUnits;

    /**
     * What the user agreed to put in. Contributions are recorded as ledger entries, so
     * uncalled capital is (committed − contributed) rather than a column that can drift.
     */
    @Column(name = "committed_amount", precision = 19, scale = 2)
    private BigDecimal committedAmount;

    @Column(name = "acquired_on")
    private LocalDate acquiredOn;

    /**
     * The user's own estimate of what the position is worth today, so net worth reflects an
     * appreciated deal rather than only the cash still at risk.
     *
     * <p>This is the holder's mark on their own asset, exactly like the current value they
     * enter against a property they own. TerraVest neither produces nor verifies it, and
     * nothing derives a return from it. Left unset, net worth falls back to unreturned capital.
     */
    @Column(name = "estimated_value", precision = 19, scale = 2)
    private BigDecimal estimatedValue;

    /** When the user last marked the position, so a stale estimate is visible as stale. */
    @Column(name = "valued_on")
    private LocalDate valuedOn;

    /** ACTIVE | EXITED */
    @Column(nullable = false, length = 20)
    private String status = "ACTIVE";

    /**
     * The Deal Room listing this position came from, when the user tracked it from the
     * directory. Purely a back-reference for context — the directory listing may be
     * edited or removed by its poster without affecting this record.
     */
    @Column(name = "source_deal_id")
    private Long sourceDealId;

    @Column(length = 2000)
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
