package com.mywealthmanagement.realestateservice.property;

import com.mywealthmanagement.realestateservice.property.dto.PropertyDocumentDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.stream.Collectors;

/**
 * The per-property document vault. Links files that already live in the user's Document
 * Center (documents-service) to a property, and optionally to a specific expense. Storage,
 * download and CPA sharing stay in documents-service; this service only owns the pointers.
 * Ownership is enforced app-side via {@code userId} (mirrors {@link PropertyExpenseService}).
 */
@Service
@RequiredArgsConstructor
public class PropertyDocumentService {

    private final PropertyDocumentRepository documentRepository;
    private final PropertyExpenseRepository expenseRepository;
    private final PropertyRepository propertyRepository;

    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    public List<String> docTypes() {
        return DocumentTypes.ALL;
    }

    public List<PropertyDocumentDto> list(Long propertyId, Long expenseId) {
        requireOwnedProperty(propertyId);
        List<PropertyDocument> rows = (expenseId == null)
                ? documentRepository.findByPropertyIdOrderByCreatedAtDescIdDesc(propertyId)
                : documentRepository.findByPropertyIdAndExpenseIdOrderByCreatedAtDescIdDesc(propertyId, expenseId);
        return rows.stream().map(this::toDto).collect(Collectors.toList());
    }

    public PropertyDocumentDto create(Long propertyId, PropertyDocumentDto dto) {
        requireOwnedProperty(propertyId);
        if (dto.getExpenseId() != null) {
            requireOwnedExpense(propertyId, dto.getExpenseId());
        }
        PropertyDocument d = new PropertyDocument();
        d.setPropertyId(propertyId);
        d.setUserId(getUserId());
        d.setExpenseId(dto.getExpenseId());
        d.setDocumentId(dto.getDocumentId());
        d.setDocumentName(trimToNull(dto.getDocumentName()));
        d.setDocType(trimToNull(dto.getDocType()));
        d.setNote(trimToNull(dto.getNote()));
        return toDto(documentRepository.save(d));
    }

    public void delete(Long propertyId, Long documentLinkId) {
        requireOwnedProperty(propertyId);
        PropertyDocument d = documentRepository.findById(documentLinkId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found"));
        if (!d.getPropertyId().equals(propertyId) || !d.getUserId().equals(getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Document not found");
        }
        documentRepository.delete(d);
    }

    // ---- helpers ----

    private static String trimToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    /** Confirms the property exists AND belongs to the caller (mirrors PropertyExpenseService). */
    private void requireOwnedProperty(Long propertyId) {
        var property = propertyRepository.findById(propertyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Property not found"));
        if (!property.getUserId().equals(getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Property not found");
        }
    }

    /** Confirms the expense exists on this property AND belongs to the caller. */
    private void requireOwnedExpense(Long propertyId, Long expenseId) {
        PropertyExpense e = expenseRepository.findById(expenseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found"));
        if (!e.getPropertyId().equals(propertyId) || !e.getUserId().equals(getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found");
        }
    }

    private PropertyDocumentDto toDto(PropertyDocument d) {
        return new PropertyDocumentDto(
                d.getId(),
                d.getPropertyId(),
                d.getExpenseId(),
                d.getDocumentId(),
                d.getDocumentName(),
                d.getDocType(),
                d.getNote(),
                d.getCreatedAt());
    }
}
