package com.mywealthmanagement.accountaggregationservice.plaid;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "plaid_items")
@Data
@NoArgsConstructor
public class PlaidItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId; // This will be the ID from the Auth Service

    @Column(name = "plaid_item_id", nullable = false, unique = true)
    private String plaidItemId;

    @Column(name = "access_token", nullable = false)
    private String accessToken; // Encrypted in production

    @Column(name = "institution_id")
    private String institutionId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public PlaidItem(Long userId, String plaidItemId, String accessToken, String institutionId) {
        this.userId = userId;
        this.plaidItemId = plaidItemId;
        this.accessToken = accessToken;
        this.institutionId = institutionId;
    }
}
