package com.mywealthmanagement.documentsservice.internal;

import com.mywealthmanagement.documentsservice.doc.Document;
import com.mywealthmanagement.documentsservice.doc.DocumentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Cross-app registry endpoint — the mechanism that makes the Document Center the
 * single source of truth. Any other service that stores a file for a user calls
 * this (best-effort, server-to-server with the shared X-Internal-Key) so the file
 * also appears in the user's personal Document Center. It returns the central
 * {@code documentId}, which the caller stores as its reference — so the same file
 * is never re-uploaded in two places.
 *
 * <p>Idempotent: keyed on (userId, sourceService, sourceRef), a repeat call updates
 * the existing registry row rather than duplicating it.
 */
@RestController
@RequestMapping("/internal/documents")
@RequiredArgsConstructor
public class InternalRegisterController {

    private final DocumentRepository documentRepo;

    @Value("${internal.key:dev-internal-audit-key}")
    private String internalKey;

    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody Map<String, Object> body,
                                        @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        Long userId = longVal(body.get("userId"));
        String sourceService = str(body.get("sourceService"));
        String sourceRef = str(body.get("sourceRef"));
        if (userId == null || sourceService == null || sourceRef == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "userId, sourceService and sourceRef are required");
        }

        Document d = documentRepo
                .findByUserIdAndSourceServiceAndSourceRef(userId, sourceService, sourceRef)
                .orElseGet(Document::new);
        d.setUserId(userId);
        d.setSourceService(sourceService);
        d.setSourceRef(sourceRef);
        d.setLabel(strOr(body.get("label"), "Document"));
        d.setDocType(strOr(body.get("docType"), "OTHER"));
        // Default to a reference the owning service resolves; allow LINK/GCS explicitly.
        d.setStorageType(strOr(body.get("storageType"), "EXTERNAL_REF"));
        d.setUrl(str(body.get("url")));
        d.setObjectName(str(body.get("objectName")));
        d.setContentType(str(body.get("contentType")));
        d.setSizeBytes(longVal(body.get("sizeBytes")));
        d.setOriginalFilename(str(body.get("originalFilename")));
        d.setNote(str(body.get("note")));
        Document saved = documentRepo.save(d);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("documentId", saved.getId());
        return out;
    }

    /** Remove a registered document by its origin (called when the source record is deleted). */
    @DeleteMapping("/register")
    public Map<String, Object> unregister(@RequestParam("userId") Long userId,
                                          @RequestParam("sourceService") String sourceService,
                                          @RequestParam("sourceRef") String sourceRef,
                                          @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        boolean removed = documentRepo
                .findByUserIdAndSourceServiceAndSourceRef(userId, sourceService, sourceRef)
                .map(d -> { documentRepo.delete(d); return true; })
                .orElse(false);
        return Map.of("removed", removed);
    }

    private String str(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private String strOr(Object o, String fallback) {
        String s = str(o);
        return s != null ? s : fallback;
    }

    private Long longVal(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        if (s.isEmpty()) return null;
        try { return Long.valueOf(s); } catch (NumberFormatException e) { return null; }
    }
}
