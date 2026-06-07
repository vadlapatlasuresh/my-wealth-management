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
    private boolean weeklySummary;
    private boolean budgetAlerts;
    private boolean paymentAlerts;
}
