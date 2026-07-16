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
    private final ShareDocumentRepository shareDocumentRepo;
    private final ShareService shareService;
    private final PasswordEncoder passwordEncoder;
    private final com.mywealthmanagement.documentsservice.comms.CommsClient commsClient;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /**
     * Create a share. Provide exactly one target:
     *   - {@code documentIds:[...]} → a multi-file share set (SET),
     *   - {@code documentId} → a single document (DOCUMENT),
     *   - {@code folderId} → a whole folder (FOLDER).
     * Body also: scope[VIEW|DOWNLOAD], expiresInDays?, passcode (REQUIRED),
     * granteeKind[LINK|CPA], granteeRef?, message?.
     */
    @PostMapping
    @Transactional
    public Map<String, Object> createShare(@RequestBody Map<String, Object> body) {
        Long uid = userId();
        List<Long> documentIds = longList(body.get("documentIds"));
        Long documentId = longVal(body.get("documentId"));
        Long folderId = longVal(body.get("folderId"));

        // Passcode is mandatory on every share.
        String passcode = str(body.get("passcode"));
        if (passcode == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A passcode is required to share a document.");
        }

        DocumentShare s = new DocumentShare();
        s.setOwnerUserId(uid);

        if (documentIds != null && !documentIds.isEmpty()) {
            // Validate every document belongs to the caller before creating the set.
            for (Long id : documentIds) {
                documentRepo.findByIdAndUserId(id, uid)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "document not found: " + id));
            }
            s.setTargetKind("SET");
        } else if (documentId != null) {
            documentRepo.findByIdAndUserId(documentId, uid)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "document not found"));
            s.setTargetKind("DOCUMENT");
            s.setDocumentId(documentId);
        } else if (folderId != null) {
            folderRepo.findByIdAndUserId(folderId, uid)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "folder not found"));
            s.setTargetKind("FOLDER");
            s.setFolderId(folderId);
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "documentIds, documentId or folderId is required");
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
        s.setPasscodeHash(passwordEncoder.encode(passcode));
        s.setToken(shareService.newToken());
        DocumentShare saved = shareRepo.save(s);

        if ("SET".equals(saved.getTargetKind())) {
            // De-dupe member ids, then persist the set membership.
            new java.util.LinkedHashSet<>(documentIds)
                    .forEach(id -> shareDocumentRepo.save(new ShareDocument(saved.getId(), id)));
        }

        Map<String, Object> view = toView(saved);
        // Optionally email the link (and, if asked, the passcode) to the recipient now,
        // while we still hold the raw passcode (only the hash is persisted).
        if (boolVal(body.get("sendEmail")) && str(saved.getGranteeRef()) != null) {
            boolean includePasscode = !body.containsKey("includePasscode") || boolVal(body.get("includePasscode"));
            String status = emailShare(saved, saved.getGranteeRef(), includePasscode ? passcode : null);
            view.put("emailStatus", status);
            view.put("emailedTo", saved.getGranteeRef());
        }
        return view;
    }

    /**
     * (Re)send the share link by email. Body: { recipient?, includePasscode?, passcode? }.
     * The raw passcode isn't stored, so to include it on a resend the owner passes it back;
     * otherwise the email carries the link only and notes the passcode is sent separately.
     */
    @PostMapping("/{id}/email")
    public Map<String, Object> emailShare(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        DocumentShare s = shareRepo.findByIdAndOwnerUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String recipient = str(b.get("recipient")) != null ? str(b.get("recipient")) : s.getGranteeRef();
        if (recipient == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A recipient email is required.");
        }
        boolean includePasscode = boolVal(b.get("includePasscode"));
        String passcode = includePasscode ? str(b.get("passcode")) : null;
        String status = emailShare(s, recipient, passcode);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("emailStatus", status);
        out.put("emailedTo", recipient);
        return out;
    }

    /** Composes and sends the share email. {@code rawPasscode} non-null → include it in the body. */
    private String emailShare(DocumentShare s, String recipient, String rawPasscode) {
        String label = targetLabel(s);
        String link = shareService.shareLink(s.getToken());
        StringBuilder body = new StringBuilder();
        body.append("Someone has securely shared \"").append(label).append("\" with you via TerraVest.\n\n");
        body.append("Open it here:\n").append(link).append("\n\n");
        if (rawPasscode != null && !rawPasscode.isBlank()) {
            body.append("Passcode: ").append(rawPasscode).append("\n\n");
        } else {
            body.append("This link is passcode-protected — the sender will share the passcode with you separately.\n\n");
        }
        body.append("Access is ").append("DOWNLOAD".equals(s.getScope()) ? "view + download" : "view-only").append(".\n");
        if (s.getExpiresAt() != null) {
            body.append("The link expires on ").append(s.getExpiresAt().toLocalDate()).append(".\n");
        }
        String subject = "A document was securely shared with you on TerraVest";
        return commsClient.send("EMAIL", recipient, subject, body.toString());
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
        shareDocumentRepo.deleteByShareId(s.getId());
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
        if ("SET".equals(s.getTargetKind())) {
            m.put("documentCount", shareDocumentRepo.findByShareId(s.getId()).size());
        }
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
        // Count real file accesses only — exclude INFO (metadata opens) and DENIED
        // (failed passcode attempts) so the owner's "views" figure isn't inflated.
        long views = accessLogRepo.findByShareIdOrderByAccessedAtDesc(s.getId()).stream()
                .filter(a -> "VIEW".equals(a.getAccessAction()) || "DOWNLOAD".equals(a.getAccessAction()))
                .count();
        m.put("accessCount", views);
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
        if ("SET".equals(s.getTargetKind())) {
            int n = shareDocumentRepo.findByShareId(s.getId()).size();
            return n + (n == 1 ? " document" : " documents");
        }
        return "";
    }

    private boolean boolVal(Object o) {
        if (o instanceof Boolean b) return b;
        return o != null && "true".equalsIgnoreCase(o.toString().trim());
    }

    /** Parses a JSON array of ids into a list of Longs (ignoring blanks/non-numeric). */
    private List<Long> longList(Object raw) {
        if (!(raw instanceof List<?> list)) return null;
        List<Long> out = new java.util.ArrayList<>();
        for (Object o : list) {
            Long v = longVal(o);
            if (v != null) out.add(v);
        }
        return out;
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
