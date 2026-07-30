package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "business_team_members")
@Data
@NoArgsConstructor
public class BusinessTeamMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    /** The invitee's internal user id — null until they accept/have an account (invite by email). */
    @Column(name = "member_user_id")
    private Long memberUserId;

    /** Email the invite was sent to; how we identify a member before/after they have an account. */
    @Column(name = "invited_email", length = 255)
    private String invitedEmail;

    @Column(nullable = false, length = 32)
    private String role = "VIEWER";

    @Column(nullable = false, length = 16)
    private String status = "ACTIVE";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
