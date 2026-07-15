package com.mywealthmanagement.documentsservice.doc;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Owner-side share management: create a secure share link over a document (or a
 * whole folder), list your shares and their status, view the access log, and
 * revoke. Defaults are privacy-first — VIEW scope unless the owner opts into
 * DOWNLOAD — and the recipient reaches the file via the public token endpoints.
 */
@RestController
@RequestMapping("/api/v1/documents/shares")
@RequiredArgsConstructor
public class ShareController {

    private final DocumentShareRepository shareRepo;
    private final DocumentRepository documentRepo;
    private final DocFolderRepository folderRepo;
    private final ShareAccessLogRepository accessLogRepo;
    private final ShareService shareService;
    private final PasswordEncoder passwordEncoder;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /**
     * Create a share. Body: { documentId | folderId (one required), scope[VIEW|DOWNLOAD],
     * expiresInDays?, passcode?, granteeKind[LINK|CPA], granteeRef?, message? }.
     */
    @PostMapping
    public Map<String, Object> createShare(@RequestBody Map<String, Object> body) {
        Long uid = userId();
        Long documentId = longVal(body.get("documentId"));
        Long folderId = longVal(body.get("folderId"));
        if (documentId == null && folderId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "documentId or folderId is required");
        }

        DocumentShare s = new DocumentShare();
        s.setOwnerUserId(uid);
        if (documentId != null) {
            documentRepo.findByIdAndUserId(documentId, uid)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "document not found"));
            s.setTargetKind("DOCUMENT");
            s.setDocumentId(documentId);
        } else {
            folderRepo.findByIdAndUserId(folderId, uid)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "folder not found"));
            s.setTargetKind("FOLDER");
            s.setFolderId(folderId);
        }

        String scope = strOr(body.get("scope"), "VIEW").toUpperCase();
        s.setScope("DOWNLOAD".equals(scope) ? "DOWNLOAD" : "VIEW");

        String granteeKind = strOr(body.get("granteeKind"), "LINK").toUpperCase();
        s.setGranteeKind("CPA".equals(granteeKind) ? "CPA" : "LINK");
        s.setGranteeRef(str(body.get("granteeRef")));
        s.setShareMessage(str(body.get("message")));

        Integer days = intVal(body.get("expiresInDays"));
        if (days != null && days > 0) {
            s.setExpiresAt(LocalDateTime.now().plusDays(days));
        }
        String passcode = str(body.get("passcode"));
        if (passcode != null) {
            s.setPasscodeHash(passwordEncoder.encode(passcode));
        }
        s.setToken(shareService.newToken());
        return toView(shareRepo.save(s));
    }

    /** All of the caller's shares, newest first, with target label + live status. */
    @GetMapping
    public List<Map<String, Object>> listShares() {
        return shareRepo.findByOwnerUserIdOrderByCreatedAtDesc(userId()).stream()
                .map(this::toView).toList();
    }

    /** The access log for one share (who opened it, when, and what they did). */
    @GetMapping("/{id}/access")
    public List<Map<String, Object>> accessLog(@PathVariable Long id) {
        DocumentShare s = shareRepo.findByIdAndOwnerUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return accessLogRepo.findByShareIdOrderByAccessedAtDesc(s.getId()).stream().map(a -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("accessedAt", a.getAccessedAt());
            m.put("action", a.getAccessAction());
            m.put("ip", a.getIp());
            m.put("userAgent", a.getUserAgent());
            return m;
        }).toList();
    }

    /** Revoke a share immediately (recipient's link stops working). */
    @PostMapping("/{id}/revoke")
    public Map<String, Object> revokeShare(@PathVariable Long id) {
        DocumentShare s = shareRepo.findByIdAndOwnerUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (s.getRevokedAt() == null) {
            s.setRevokedAt(LocalDateTime.now());
            shareRepo.save(s);
        }
        return toView(s);
    }

    /** Delete a share and its access log entirely. */
    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> deleteShare(@PathVariable Long id) {
        DocumentShare s = shareRepo.findByIdAndOwnerUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        accessLogRepo.deleteByShareId(s.getId());
        shareRepo.delete(s);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- helpers ---------------- */

    private Map<String, Object> toView(DocumentShare s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("targetKind", s.getTargetKind());
        m.put("documentId", s.getDocumentId());
        m.put("folderId", s.getFolderId());
        m.put("targetLabel", targetLabel(s));
        m.put("scope", s.getScope());
        m.put("granteeKind", s.getGranteeKind());
        m.put("granteeRef", s.getGranteeRef());
        m.put("message", s.getShareMessage());
        m.put("hasPasscode", s.getPasscodeHash() != null);
        m.put("expiresAt", s.getExpiresAt());
        m.put("revokedAt", s.getRevokedAt());
        m.put("lastAccessedAt", s.getLastAccessedAt());
        m.put("createdAt", s.getCreatedAt());
        m.put("active", s.isActive());
        m.put("status", s.getRevokedAt() != null ? "revoked"
                : (s.getExpiresAt() != null && s.getExpiresAt().isBefore(LocalDateTime.now()) ? "expired" : "active"));
        m.put("accessCount", accessLogRepo.findByShareIdOrderByAccessedAtDesc(s.getId()).size());
        m.put("link", shareService.shareLink(s.getToken()));
        m.put("token", s.getToken());
        return m;
    }

    private String targetLabel(DocumentShare s) {
        if ("DOCUMENT".equals(s.getTargetKind()) && s.getDocumentId() != null) {
            return documentRepo.findByIdAndUserId(s.getDocumentId(), s.getOwnerUserId())
                    .map(Document::getLabel).orElse("(deleted document)");
        }
        if ("FOLDER".equals(s.getTargetKind()) && s.getFolderId() != null) {
            return folderRepo.findByIdAndUserId(s.getFolderId(), s.getOwnerUserId())
                    .map(DocFolder::getName).orElse("(deleted folder)");
        }
        return "";
    }

    private String str(Object o) {
        if (o == null) return null;
        String v = o.toString().trim();
        return v.isEmpty() ? null : v;
    }

    private String strOr(Object o, String fallback) {
        String v = str(o);
        return v != null ? v : fallback;
    }

    private Long longVal(Object o) {
        if (o == null) return null;
        String v = o.toString().trim();
        if (v.isEmpty()) return null;
        try { return Long.valueOf(v); } catch (NumberFormatException e) { return null; }
    }

    private Integer intVal(Object o) {
        if (o == null) return null;
        String v = o.toString().trim();
        if (v.isEmpty()) return null;
        try { return (int) Double.parseDouble(v); } catch (NumberFormatException e) { return null; }
    }
}
