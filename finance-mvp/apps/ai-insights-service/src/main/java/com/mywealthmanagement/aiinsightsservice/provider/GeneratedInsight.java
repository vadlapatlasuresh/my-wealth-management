package com.mywealthmanagement.aiinsightsservice.provider;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A provider-generated insight, decoupled from the persistence entity.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GeneratedInsight {
    private String title;
    private String reason;
    private String severity; // INFO | WARNING | ACTIONABLE
    private String suggestedAction;
}
