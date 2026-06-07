package com.mywealthmanagement.aiinsightsservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InsightDto {
    private Long id;
    private String title;
    private String reason;
    private String severity;
    private String suggestedAction;
    private LocalDateTime createdAt;
}
