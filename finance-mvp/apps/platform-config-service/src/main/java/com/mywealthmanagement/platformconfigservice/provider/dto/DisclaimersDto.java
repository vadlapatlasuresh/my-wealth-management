package com.mywealthmanagement.platformconfigservice.provider.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DisclaimersDto {
    private List<DisclaimerItemDto> items;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DisclaimerItemDto {
        private String key;
        private Integer version;
        private String locale;
        private String title;
        private String bodyMarkdown;
        private Boolean requiresAcceptance;
    }
}
