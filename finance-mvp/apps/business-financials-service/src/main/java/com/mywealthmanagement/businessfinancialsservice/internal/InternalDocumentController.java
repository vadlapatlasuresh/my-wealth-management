package com.mywealthmanagement.businessfinancialsservice.internal;

import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessDocument;
import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessDocumentRepository;
import com.mywealthmanagement.businessfinancialsservice.business.storage.DocumentStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Server-to-server byte source for an uploaded business document. Called by
 * documents-service (shared X-Internal-Key) when a recipient opens a business file
 * that was shared through the personal Document Center: the bytes live in this
 * service's Cloud Storage, so documents-service proxies the download here.
 */
@RestController
@RequestMapping("/internal/business-documents")
@RequiredArgsConstructor
public class InternalDocumentController {

    private final BusinessDocumentRepository documentRepo;
    private final DocumentStorageService storageService;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> download(@PathVariable Long id,
                                           @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        BusinessDocument d = documentRepo.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "document not found"));
        if (!"GCS".equalsIgnoreCase(d.getStorageType()) || d.getObjectName() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "this document is a link, not an uploaded file");
        }
        var dl = storageService.download(d.getObjectName());
        String filename = d.getOriginalFilename() != null ? d.getOriginalFilename() : "document";
        return ResponseEntity.ok()
                .header("Content-Type", dl.contentType() != null ? dl.contentType() : "application/octet-stream")
                .header("Content-Disposition", "inline; filename=\"" + filename.replace("\"", "") + "\"")
                .body(dl.bytes());
    }
}
