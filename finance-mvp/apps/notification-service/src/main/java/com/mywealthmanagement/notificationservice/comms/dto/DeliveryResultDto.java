package com.mywealthmanagement.notificationservice.comms.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DeliveryResultDto {
    private String channel;
    private String status;
    private String providerRef;
    private String message;
}
