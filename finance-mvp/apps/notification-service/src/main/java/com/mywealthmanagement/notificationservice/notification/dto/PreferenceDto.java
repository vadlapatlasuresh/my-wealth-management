package com.mywealthmanagement.notificationservice.notification.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PreferenceDto {
    private boolean emailEnabled;
    private boolean pushEnabled;
    private boolean smsEnabled;
    private boolean weeklySummary;
    private boolean budgetAlerts;
    private boolean paymentAlerts;
    private boolean dealAlerts;
    private boolean dealBoardWeekly;
}
