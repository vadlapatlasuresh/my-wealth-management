package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * A first-class expense record on a business.
 *
 * <p>Relationship to the ledger — this is the important bit. Spend analytics (P&amp;L,
 * spend-by-category) are derived from the merged transaction ledger, so an expense must
 * declare whether it represents NEW spend or merely documents existing ledger rows:
 *
 * <ul>
 *   <li>{@code STANDALONE} — not in the ledger (cash / out-of-pocket receipt). Carries its
 *       own {@link #amount} and counts as new spend.</li>
 *   <li>{@code LINKED} — backed by {@link BusinessExpenseLink} rows. {@link #amount} stays
 *       null and the effective amount is derived from the links, so it never double-counts.</li>
 * </ul>
 */
@Entity
@Table(name = "business_expenses")
@Data
@NoArgsConstructor
public class BusinessExpense {

    public static final String MODE_STANDALONE = "STANDALONE";
    public static final String MODE_LINKED = "LINKED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "expense_date", nullable = false)
    private LocalDate expenseDate;

    @Column(nullable = false, length = 80)
    private String category;

    @Column(length = 200)
    private String vendor;

    @Column(length = 500)
    private String description;

    /** Required for STANDALONE; null for LINKED (derived from the links). */
    @Column(precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(name = "source_mode", nullable = false, length = 16)
    private String sourceMode = MODE_STANDALONE;

    @Column(nullable = false, length = 24)
    private String status = "RECORDED";

    @Column(name = "payment_method", length = 40)
    private String paymentMethod;

    /** Points at business_documents.id when a receipt has been uploaded. */
    @Column(name = "receipt_document_id")
    private Long receiptDocumentId;

    @Column(length = 1000)
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
