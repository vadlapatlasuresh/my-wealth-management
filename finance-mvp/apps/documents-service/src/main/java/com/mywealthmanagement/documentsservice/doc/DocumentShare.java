package com.mywealthmanagement.documentsservice.doc;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A shareable grant over a document or a whole folder. Access is via an opaque
 * {@link #token} (a secure link the owner sends), optionally protected by a
 * passcode and an expiry. {@code scope} controls view-only vs. download. When the
 * grant targets a connected CPA ({@code granteeKind = CPA}) the same token also
 * surfaces to that CPA in-app. Revoking sets {@link #revokedAt}.
 */
@Entity
@Table(name = "document_shares")
@Data
@NoArgsConstructor
public class DocumentShare {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    /** DOCUMENT | FOLDER. */
    @Column(name = "target_kind", nullable = false, length = 16)
    private String targetKind;

    @Column(name = "document_id")
    private Long documentId;

    @Column(name = "folder_id")
    private Long folderId;

    /** LINK (anyone with the link/email) | CPA (a connected CPA). */
    @Column(name = "grantee_kind", nullable = false, length = 16)
    private String granteeKind = "LINK";

    /** Recipient email, or connected-CPA identifier/label. */
    @Column(name = "grantee_ref", length = 200)
    private String granteeRef;

    @Column(nullable = false, length = 64)
    private String token;

    /** VIEW (view-only, default) | DOWNLOAD. */
    @Column(nullable = false, length = 16)
    private String scope = "VIEW";

    /** BCrypt hash of the optional passcode; null = no passcode. */
    @Column(name = "passcode_hash", length = 200)
    private String passcodeHash;

    @Column(name = "share_message", length = 500)
    private String shareMessage;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "last_accessed_at")
    private LocalDateTime lastAccessedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** A share is live when it has not been revoked and has not expired. */
    @Transient
    public boolean isActive() {
        return revokedAt == null && (expiresAt == null || expiresAt.isAfter(LocalDateTime.now()));
    }
}
