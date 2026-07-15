package com.mywealthmanagement.documentsservice.doc;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;

/** Token generation, share-link building and access logging shared by the owner + public controllers. */
@Service
@RequiredArgsConstructor
public class ShareService {

    private final ShareAccessLogRepository accessLogRepo;
    private static final SecureRandom RANDOM = new SecureRandom();

    @Value("${app.web-url:http://localhost:5173}")
    private String webUrl;

    /** A URL-safe, unguessable 32-byte token. */
    public String newToken() {
        byte[] buf = new byte[32];
        RANDOM.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    /** The recipient-facing link the owner sends. */
    public String shareLink(String token) {
        String base = webUrl == null || webUrl.isBlank() ? "" : webUrl.replaceAll("/+$", "");
        return base + "/shared/" + token;
    }

    /** Records an access (INFO | VIEW | DOWNLOAD | DENIED) against a share. */
    public void logAccess(DocumentShare share, HttpServletRequest req, String action) {
        ShareAccessLog row = new ShareAccessLog();
        row.setShareId(share.getId());
        row.setAccessAction(action);
        if (req != null) {
            row.setIp(clientIp(req));
            String ua = req.getHeader("User-Agent");
            if (ua != null && ua.length() > 400) ua = ua.substring(0, 400);
            row.setUserAgent(ua);
        }
        accessLogRepo.save(row);
    }

    private String clientIp(HttpServletRequest req) {
        String fwd = req.getHeader("X-Forwarded-For");
        String ip = (fwd != null && !fwd.isBlank()) ? fwd.split(",")[0].trim() : req.getRemoteAddr();
        if (ip != null && ip.length() > 64) ip = ip.substring(0, 64);
        return ip;
    }

    /** Reason a share is not usable, or null if it is live. */
    public String inactiveReason(DocumentShare s) {
        if (s.getRevokedAt() != null) return "revoked";
        if (s.getExpiresAt() != null && s.getExpiresAt().isBefore(LocalDateTime.now())) return "expired";
        return null;
    }
}
