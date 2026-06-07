package com.mywealthmanagement.notificationservice.notification;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "notifications")
@Data
@NoArgsConstructor
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "type", nullable = false)
    private String type; // BUDGET|PAYMENT|ACCOUNT|SYSTEM

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "body", columnDefinition = "TEXT")
    private String body;

    @Column(name = "channel", nullable = false)
    private String channel; // EMAIL|PUSH|INAPP

    // 'read' is a reserved word; field is readFlag mapped to column "is_read"
    @Column(name = "is_read", nullable = false)
    private boolean readFlag;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Notification(Long userId, String type, String title, String body, String channel) {
        this.userId = userId;
        this.type = type;
        this.title = title;
        this.body = body;
        this.channel = channel;
        this.readFlag = false;
    }
}
