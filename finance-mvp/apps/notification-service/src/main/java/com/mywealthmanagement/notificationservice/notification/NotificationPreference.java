package com.mywealthmanagement.notificationservice.notification;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "notification_preferences")
@Data
@NoArgsConstructor
public class NotificationPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(name = "email_enabled", nullable = false)
    private boolean emailEnabled;

    @Column(name = "push_enabled", nullable = false)
    private boolean pushEnabled;

    @Column(name = "sms_enabled", nullable = false)
    private boolean smsEnabled;

    @Column(name = "weekly_summary", nullable = false)
    private boolean weeklySummary;

    @Column(name = "budget_alerts", nullable = false)
    private boolean budgetAlerts;

    @Column(name = "payment_alerts", nullable = false)
    private boolean paymentAlerts;

    @Column(name = "deal_alerts", nullable = false)
    private boolean dealAlerts;

    @Column(name = "deal_board_weekly", nullable = false)
    private boolean dealBoardWeekly;

    public NotificationPreference(Long userId) {
        this.userId = userId;
    }
}
