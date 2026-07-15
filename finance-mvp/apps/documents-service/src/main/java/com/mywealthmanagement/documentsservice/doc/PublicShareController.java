package com.mywealthmanagement.documentsservice.doc;

import com.mywealthmanagement.documentsservice.storage.DocumentStorageService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Public, token-based access for share recipients (a CPA or trusted party who has
 * no app account). Permitted through Spring Security by path; the opaque token and
 * optional passcode are the only credentials. Every access is written to the
 * share's audit log, and expiry / revocation are enforced here.
 */
@RestController
@RequestMapping("/api/v1/documents/shared")
@RequiredArgsConstructor
public class PublicShareController {

    private final DocumentShareRepository shareRepo;
    private final DocumentRepository documentRepo;
    private final ShareService shareService;
    private final DocumentStorageService storageService;
    private final PasswordEncoder passwordEncoder;

    /** Metadata for a shared link. Files are included only when the passcode (if any) checks out. */
    @GetMapping("/{token}")
    public Map<String, Object> info(@PathVariable String token,
                                    @RequestParam(value = "passcode", required = false) String passcode,
                                    HttpServletRequest req) {
        DocumentShare s = shareRepo.findByToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "This link is not valid."));

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", statusOf(s));
        m.put("active", s.isActive());
        m.put("scope", s.getScope());
        m.put("message", s.getShareMessage());
        boolean requiresPasscode = s.getPasscodeHash() != null;
        m.put("requiresPasscode", requiresPasscode);
        m.put("targetKind", s.getTargetKind());

        if (!s.isActive()) {
            return m; // expired/revoked: metadata only, no files
        }
        boolean passOk = !requiresPasscode
                || (passcode != null && passwordEncoder.matches(passcode, s.getPasscodeHash()));
        m.put("passcodeOk", passOk);
        if (requiresPasscode && !passOk) {
            if (passcode != null) shareService.logAccess(s, req, "DENIED");
            return m; // withhold files until the passcode is right
        }

        m.put("files", filesFor(s));
        shareService.logAccess(s, req, "INFO");
        touch(s);
        return m;
    }

    /** Stream a shared file's bytes. Enforces active + passcode; logs VIEW or DOWNLOAD. */
    @GetMapping("/{token}/file")
    public ResponseEntity<byte[]> file(@PathVariable String token,
                                       @RequestParam("docId") Long docId,
                                       @RequestParam(value = "passcode", required = false) String passcode,
                                       HttpServletRequest req) {
        DocumentShare s = shareRepo.findByToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "This link is not valid."));
        if (!s.isActive()) {
            throw new ResponseStatusException(HttpStatus.GONE, "This link is no longer available (" + statusOf(s) + ").");
        }
        if (s.getPasscodeHash() != null
                && (passcode == null || !passwordEncoder.matches(passcode, s.getPasscodeHash()))) {
            shareService.logAccess(s, req, "DENIED");
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "A valid passcode is required.");
        }
        Document d = documentRepo.findById(docId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "document not found"));
        if (!belongsToShare(s, d)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "That file is not part of this share.");
        }
        if (!"GCS".equalsIgnoreCase(d.getStorageType()) || d.getObjectName() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "this shared item is a link, not a stored file");
        }
        var dl = storageService.download(d.getObjectName());
        boolean download = "DOWNLOAD".equalsIgnoreCase(s.getScope());
        shareService.logAccess(s, req, download ? "DOWNLOAD" : "VIEW");
        touch(s);
        String filename = d.getOriginalFilename() != null ? d.getOriginalFilename() : "document";
        String disposition = (download ? "attachment" : "inline") + "; filename=\"" + filename.replace("\"", "") + "\"";
        return ResponseEntity.ok()
                .header("Content-Type", dl.contentType() != null ? dl.contentType() : "application/octet-stream")
                .header("Content-Disposition", disposition)
                .body(dl.bytes());
    }

    /* ---------------- helpers ---------------- */

    private List<Map<String, Object>> filesFor(DocumentShare s) {
        List<Document> docs = new ArrayList<>();
        if ("DOCUMENT".equals(s.getTargetKind()) && s.getDocumentId() != null) {
            documentRepo.findById(s.getDocumentId()).ifPresent(docs::add);
        } else if ("FOLDER".equals(s.getTargetKind()) && s.getFolderId() != null) {
            docs.addAll(documentRepo.findByUserIdAndFolderIdOrderByCreatedAtDesc(s.getOwnerUserId(), s.getFolderId()));
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Document d : docs) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("docId", d.getId());
            m.put("label", d.getLabel());
            m.put("docType", d.getDocType());
            m.put("filename", d.getOriginalFilename());
            m.put("contentType", d.getContentType());
            m.put("sizeBytes", d.getSizeBytes());
            m.put("isFile", "GCS".equalsIgnoreCase(d.getStorageType()));
            // For LINK / EXTERNAL_REF documents the recipient opens the url directly.
            m.put("url", "GCS".equalsIgnoreCase(d.getStorageType()) ? null : d.getUrl());
            out.add(m);
        }
        return out;
    }

    private boolean belongsToShare(DocumentShare s, Document d) {
        if (!d.getUserId().equals(s.getOwnerUserId())) return false;
        if ("DOCUMENT".equals(s.getTargetKind())) return d.getId().equals(s.getDocumentId());
        if ("FOLDER".equals(s.getTargetKind())) return s.getFolderId() != null && s.getFolderId().equals(d.getFolderId());
        return false;
    }

    private String statusOf(DocumentShare s) {
        if (s.getRevokedAt() != null) return "revoked";
        if (s.getExpiresAt() != null && s.getExpiresAt().isBefore(LocalDateTime.now())) return "expired";
        return "active";
    }

    private void touch(DocumentShare s) {
        s.setLastAccessedAt(LocalDateTime.now());
        shareRepo.save(s);
    }
}
