package com.mywealthmanagement.realestateservice.property;

import com.mywealthmanagement.realestateservice.property.dto.PropertyDocumentDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * A property's document vault: /api/v1/real-estate/{propertyId}/documents.
 * The gateway already routes /api/v1/real-estate/** so no gateway change is needed.
 * The files themselves are uploaded to documents-service by the client; this endpoint only
 * records the link (documentId + cached name/type) to the property (and optional expense).
 */
@RestController
@RequestMapping("/api/v1/real-estate/{propertyId}/documents")
@RequiredArgsConstructor
public class PropertyDocumentController {

    private final PropertyDocumentService documentService;

    @GetMapping
    public ResponseEntity<List<PropertyDocumentDto>> list(
            @PathVariable Long propertyId,
            @RequestParam(value = "expenseId", required = false) Long expenseId) {
        return ResponseEntity.ok(documentService.list(propertyId, expenseId));
    }

    @GetMapping("/types")
    public ResponseEntity<List<String>> types(@PathVariable Long propertyId) {
        return ResponseEntity.ok(documentService.docTypes());
    }

    @PostMapping
    public ResponseEntity<PropertyDocumentDto> link(
            @PathVariable Long propertyId,
            @Valid @RequestBody PropertyDocumentDto dto) {
        return ResponseEntity.ok(documentService.create(propertyId, dto));
    }

    @DeleteMapping("/{documentLinkId}")
    public ResponseEntity<Void> unlink(
            @PathVariable Long propertyId,
            @PathVariable Long documentLinkId) {
        documentService.delete(propertyId, documentLinkId);
        return ResponseEntity.noContent().build();
    }
}
