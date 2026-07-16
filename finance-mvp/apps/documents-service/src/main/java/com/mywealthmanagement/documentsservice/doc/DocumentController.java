package com.mywealthmanagement.documentsservice.doc;

import com.mywealthmanagement.documentsservice.storage.DocumentStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The personal Document Center API. Folders + documents are per-user (the JWT
 * subject is the userId). A document is a file uploaded here (GCS), an external
 * link, or a reference to a file another service owns. Deleting a document that
 * still has an active share is blocked until the share is revoked.
 */
@RestController
@RequestMapping("/api/v1/documents")
@RequiredArgsConstructor
public class DocumentController {

    private final DocFolderRepository folderRepo;
    private final DocumentRepository documentRepo;
    private final DocumentShareRepository shareRepo;
    private final ShareAccessLogRepository accessLogRepo;
    private final DocumentStorageService storageService;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /* ---------------- Capability + summary ---------------- */

    /** Whether file uploads are available (GCS configured). UI falls back to link-only when false. */
    @GetMapping("/config")
    public Map<String, Object> config() {
        return Map.of("uploadEnabled", storageService.isEnabled());
    }

    /** Header counts: total documents, folders, and how many documents are actively shared. */
    @GetMapping("/summary")
    public Map<String, Object> summary() {
        Long uid = userId();
        long totalDocs = documentRepo.findByUserIdOrderByCreatedAtDesc(uid).size();
        long folders = folderRepo.findByUserIdOrderByNameAsc(uid).size();
        long shared = shareRepo.findByOwnerUserIdOrderByCreatedAtDesc(uid).stream()
                .filter(DocumentShare::isActive).count();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("documents", totalDocs);
        m.put("folders", folders);
        m.put("activeShares", shared);
        return m;
    }

    /* ---------------- Folders ---------------- */

    @GetMapping("/folders")
    public List<Map<String, Object>> listFolders() {
        Long uid = userId();
        return folderRepo.findByUserIdOrderByNameAsc(uid).stream().map(f -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", f.getId());
            m.put("name", f.getName());
            m.put("parentId", f.getParentId());
            m.put("createdAt", f.getCreatedAt());
            m.put("documentCount", documentRepo.countByUserIdAndFolderId(uid, f.getId()));
            return m;
        }).toList();
    }

    @PostMapping("/folders")
    public DocFolder createFolder(@RequestBody Map<String, Object> body) {
        DocFolder f = new DocFolder();
        f.setUserId(userId());
        f.setName(requireStr(body.get("name"), "name is required"));
        Long parentId = longVal(body.get("parentId"));
        if (parentId != null) {
            folderRepo.findByIdAndUserId(parentId, userId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "parent folder not found"));
            f.setParentId(parentId);
        }
        return folderRepo.save(f);
    }

    @PutMapping("/folders/{id}")
    public DocFolder renameFolder(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        DocFolder f = folderRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        f.setName(requireStr(body.get("name"), "name is required"));
        return folderRepo.save(f);
    }

    /** Delete a folder. Blocked while it still contains documents or subfolders. */
    @DeleteMapping("/folders/{id}")
    @Transactional
    public ResponseEntity<Void> deleteFolder(@PathVariable Long id) {
        Long uid = userId();
        DocFolder f = folderRepo.findByIdAndUserId(id, uid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (documentRepo.countByUserIdAndFolderId(uid, id) > 0
                || folderRepo.existsByUserIdAndParentId(uid, id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This folder isn't empty. Move or delete its contents first.");
        }
        if (hasActiveFolderShare(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This folder is currently shared. Revoke the share before deleting it.");
        }
        folderRepo.delete(f);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- Documents ---------------- */

    /**
     * List documents. No params → every document (the "All documents" view).
     * {@code folderId} → documents in that folder. {@code root=true} → documents
     * not filed in any folder.
     */
    @GetMapping
    public List<Map<String, Object>> listDocuments(
            @RequestParam(value = "folderId", required = false) Long folderId,
            @RequestParam(value = "root", required = false, defaultValue = "false") boolean root) {
        Long uid = userId();
        List<Document> docs;
        if (folderId != null) {
            docs = documentRepo.findByUserIdAndFolderIdOrderByCreatedAtDesc(uid, folderId);
        } else if (root) {
            docs = documentRepo.findByUserIdAndFolderIdIsNullOrderByCreatedAtDesc(uid);
        } else {
            docs = documentRepo.findByUserIdOrderByCreatedAtDesc(uid);
        }
        return docs.stream().map(this::toView).toList();
    }

    @PostMapping
    public Map<String, Object> createLinkDocument(@RequestBody Map<String, Object> body) {
        Document d = new Document();
        d.setUserId(userId());
        d.setLabel(requireStr(body.get("label"), "label is required"));
        d.setUrl(requireStr(body.get("url"), "url is required"));
        d.setStorageType("LINK");
        d.setDocType(strOr(body.get("docType"), "OTHER"));
        d.setNote(str(body.get("note")));
        d.setFolderId(resolveFolder(longVal(body.get("folderId"))));
        return toView(documentRepo.save(d));
    }

    /** Upload a file into the center (optionally into a folder). Stored in GCS. */
    @PostMapping(value = "/upload", consumes = "multipart/form-data")
    public Map<String, Object> uploadDocument(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "label", required = false) String label,
            @RequestParam(value = "docType", required = false) String docType,
            @RequestParam(value = "note", required = false) String note,
            @RequestParam(value = "folderId", required = false) String folderId) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "file is required");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (java.io.IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "could not read the uploaded file");
        }
        var stored = storageService.upload(userId(), file.getOriginalFilename(), file.getContentType(), bytes);

        Document d = new Document();
        d.setUserId(userId());
        d.setStorageType("GCS");
        d.setObjectName(stored.objectName());
        d.setContentType(stored.contentType());
        d.setSizeBytes(stored.size());
        d.setOriginalFilename(file.getOriginalFilename());
        String lbl = str(label);
        d.setLabel(lbl != null ? lbl : (file.getOriginalFilename() == null ? "Uploaded file" : file.getOriginalFilename()));
        d.setDocType(strOr(docType, "OTHER"));
        d.setNote(str(note));
        d.setFolderId(resolveFolder(longVal(folderId)));
        return toView(documentRepo.save(d));
    }

    /** Update a document's metadata (label / type / note / folder). */
    @PutMapping("/{id}")
    public Map<String, Object> updateDocument(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Document d = documentRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (body.containsKey("label")) d.setLabel(requireStr(body.get("label"), "label cannot be blank"));
        if (body.containsKey("docType")) d.setDocType(strOr(body.get("docType"), "OTHER"));
        if (body.containsKey("note")) d.setNote(str(body.get("note")));
        if (body.containsKey("folderId")) d.setFolderId(resolveFolder(longVal(body.get("folderId"))));
        return toView(documentRepo.save(d));
    }

    /** Stream an uploaded document's bytes back to the owner (authenticated). */
    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> downloadDocument(@PathVariable Long id) {
        Document d = documentRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
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

    /**
     * Delete a document. Blocked (409) while it still has an ACTIVE share, so a file
     * can never vanish out from under someone it's currently shared with. Revoked /
     * expired shares and their access logs are cleaned up.
     */
    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> deleteDocument(@PathVariable Long id) {
        Document d = documentRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        boolean activeShare = shareRepo.findByDocumentIdAndRevokedAtIsNull(id).stream()
                .anyMatch(DocumentShare::isActive);
        // Also block if the document is exposed through an active share on its folder,
        // so a file can never vanish out from under a folder-level share either.
        if (activeShare || (d.getFolderId() != null && hasActiveFolderShare(d.getFolderId()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This document is currently shared. Revoke the share before deleting it.");
        }
        // Clean up any revoked/expired shares (+ their access logs) referencing this doc.
        for (DocumentShare s : shareRepo.findByDocumentId(id)) {
            accessLogRepo.deleteByShareId(s.getId());
            shareRepo.delete(s);
        }
        if ("GCS".equalsIgnoreCase(d.getStorageType())) {
            storageService.delete(d.getObjectName());
        }
        documentRepo.delete(d);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- helpers ---------------- */

    /** True when the folder has at least one live (non-revoked, non-expired) share. */
    private boolean hasActiveFolderShare(Long folderId) {
        return shareRepo.findByFolderIdAndRevokedAtIsNull(folderId).stream()
                .anyMatch(DocumentShare::isActive);
    }

    /** Validates that the folder (if given) belongs to the caller; returns it or null. */
    private Long resolveFolder(Long folderId) {
        if (folderId == null) return null;
        folderRepo.findByIdAndUserId(folderId, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "folder not found"));
        return folderId;
    }

    /** A client-facing view of a document, including whether it is currently shared. */
    private Map<String, Object> toView(Document d) {
        boolean shared = shareRepo.findByDocumentIdAndRevokedAtIsNull(d.getId()).stream()
                .anyMatch(DocumentShare::isActive);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", d.getId());
        m.put("folderId", d.getFolderId());
        m.put("label", d.getLabel());
        m.put("storageType", d.getStorageType());
        m.put("url", d.getUrl());
        m.put("contentType", d.getContentType());
        m.put("sizeBytes", d.getSizeBytes());
        m.put("originalFilename", d.getOriginalFilename());
        m.put("docType", d.getDocType());
        m.put("sourceService", d.getSourceService());
        m.put("sourceRef", d.getSourceRef());
        m.put("note", d.getNote());
        m.put("createdAt", d.getCreatedAt());
        m.put("updatedAt", d.getUpdatedAt());
        m.put("shared", shared);
        m.put("isFile", "GCS".equalsIgnoreCase(d.getStorageType()));
        return m;
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

    private String requireStr(Object o, String message) {
        String s = str(o);
        if (s == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        return s;
    }

    private Long longVal(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        if (s.isEmpty()) return null;
        try {
            return Long.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
