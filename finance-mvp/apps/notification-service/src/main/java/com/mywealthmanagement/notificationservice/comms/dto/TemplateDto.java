package com.mywealthmanagement.notificationservice.comms.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TemplateDto {
    private Long id;
    private String templateKey;
    private String channel;
    private String locale;
    private String subject;
    private String body;
    private String variables;
    private int version;
    private boolean enabled;
}
