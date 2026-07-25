package com.mywealthmanagement.realestateservice.property;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A link from a property's document vault to a file in the user's Document Center
 * (documents-service). The file itself lives in documents-service — the one place that
 * already handles storage, download authorization and CPA sharing — so here we store only
 * the pointer ({@code documentId}) plus a cached name/type so the vault renders and the tax
 * export references each file without a second call.
 *
 * {@code expenseId} is nullable: a null row is a property-level document (a 1098, insurance
 * policy, HOA statement, tax assessment); a set row is a receipt/image attached to one
 * {@link PropertyExpense}. Ownership is enforced app-side via {@code userId}.
 */
@Entity
@Table(name = "property_documents")
@Data
@NoArgsConstructor
public class PropertyDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "property_id", nullable = false)
    private Long propertyId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    // Null => property-level doc; set => a receipt attached to this expense.
    @Column(name = "expense_id")
    private Long expenseId;

    @Column(name = "document_id", nullable = false)
    private Long documentId;

    @Column(name = "document_name", length = 300)
    private String documentName;

    // RECEIPT | FORM_1098 | INSURANCE | HOA | TAX_ASSESSMENT | MORTGAGE | OTHER
    @Column(name = "doc_type", length = 40)
    private String docType;

    @Column(length = 500)
    private String note;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
