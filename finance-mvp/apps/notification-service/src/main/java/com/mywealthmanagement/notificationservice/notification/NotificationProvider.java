package com.mywealthmanagement.notificationservice.notification;

public interface NotificationProvider {
    void send(Long userId, String type, String title, String body, String channel);
}
