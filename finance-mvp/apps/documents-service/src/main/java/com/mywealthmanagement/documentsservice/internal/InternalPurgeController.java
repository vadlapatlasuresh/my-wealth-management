package com.mywealthmanagement.documentsservice.internal;

import com.mywealthmanagement.documentsservice.doc.*;
import com.mywealthmanagement.documentsservice.storage.DocumentStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Purges all Document Center data (folders, documents, shares, access logs, GCS objects) for a user on account deletion. */
@RestController
@RequestMapping("/internal/users")
@RequiredArgsConstructor
public class InternalPurgeController {

    private final DocFolderRepository folderRepo;
    private final DocumentRepository documentRepo;
    private final DocumentShareRepository shareRepo;
    private final ShareDocumentRepository shareDocumentRepo;
    private final ShareAccessLogRepository accessLogRepo;
    private final DocumentStorageService storageService;

    @Value("${internal.key:dev-internal-audit-key}")
    private String internalKey;

    @DeleteMapping("/{userId}")
    @Transactional
    public ResponseEntity<Void> purge(@PathVariable Long userId,
                                      @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        // Shares + their access logs + set memberships.
        for (DocumentShare s : shareRepo.findByOwnerUserIdOrderByCreatedAtDesc(userId)) {
            accessLogRepo.deleteByShareId(s.getId());
            shareDocumentRepo.deleteByShareId(s.getId());
        }
        shareRepo.deleteByOwnerUserId(userId);
        // Documents (best-effort GCS cleanup) + folders.
        for (Document d : documentRepo.findByUserIdOrderByCreatedAtDesc(userId)) {
            if ("GCS".equalsIgnoreCase(d.getStorageType())) {
                storageService.delete(d.getObjectName());
            }
        }
        documentRepo.deleteByUserId(userId);
        folderRepo.deleteByUserId(userId);
        return ResponseEntity.noContent().build();
    }
}
