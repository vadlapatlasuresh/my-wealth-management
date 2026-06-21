package com.mywealthmanagement.notificationservice.notification;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * A push registration token for one of a user's devices (FCM registration token for
 * web/Android, APNs via FCM for iOS). A user can have several (phone, laptop, …); push
 * fans out to all of them. Tokens are unique and replaced if re-registered.
 */
@Entity
@Table(name = "device_token",
        uniqueConstraints = @UniqueConstraint(columnNames = "token"))
@Data
@NoArgsConstructor
public class DeviceToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token", nullable = false, length = 512)
    private String token;

    @Column(name = "platform", length = 20)
    private String platform; // web | ios | android

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
