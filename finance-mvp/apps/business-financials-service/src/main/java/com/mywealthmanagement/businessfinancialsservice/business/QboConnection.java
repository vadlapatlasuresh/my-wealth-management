package com.mywealthmanagement.businessfinancialsservice.business;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "qbo_connections")
@Data
@NoArgsConstructor
public class QboConnection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(name = "connected", nullable = false)
    private boolean connected;

    @Column(name = "realm_id")
    private String realmId;

    @Column(name = "company_name")
    private String companyName;

    /** QBO OAuth2 access token (short-lived, ~1h). Null in mock mode. */
    @Column(name = "access_token", length = 2048)
    private String accessToken;

    /** QBO OAuth2 refresh token (long-lived, ~100 days). Null in mock mode. */
    @Column(name = "refresh_token", length = 2048)
    private String refreshToken;

    /** When the current access token expires; used to decide when to refresh. */
    @Column(name = "token_expires_at")
    private LocalDateTime tokenExpiresAt;

    @Column(name = "last_sync_at")
    private LocalDateTime lastSyncAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public QboConnection(Long userId) {
        this.userId = userId;
    }
}
