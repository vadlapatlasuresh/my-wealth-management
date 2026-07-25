package com.mywealthmanagement.realestateservice.property.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * One entry in a property's document vault. {@code documentId} points at the file in the
 * user's Document Center; {@code expenseId} (optional) ties a receipt to a specific expense.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PropertyDocumentDto {
    private Long id;
    private Long propertyId;

    // Optional — set to attach the file to a specific expense (a receipt); null = property-level.
    private Long expenseId;

    @NotNull(message = "documentId is required")
    private Long documentId;

    @Size(max = 300, message = "documentName must be at most 300 characters")
    private String documentName;

    @Size(max = 40, message = "docType must be at most 40 characters")
    private String docType;

    @Size(max = 500, message = "note must be at most 500 characters")
    private String note;

    private LocalDateTime createdAt;
}
