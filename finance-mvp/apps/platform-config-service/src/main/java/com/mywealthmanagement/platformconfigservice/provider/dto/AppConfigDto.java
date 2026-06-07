package com.mywealthmanagement.platformconfigservice.provider.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AppConfigDto {
    private String theme;
    private String version;
    private List<SectionDto> sections;
    private List<ModuleDto> modules;
    private List<String> dashboardLayout;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SectionDto {
        private String id;
        private String label;
        private Integer order;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ModuleDto {
        private String id;
        private String title;
        private String icon;
        private String route;
        private String section;
        private Integer order;
        private Boolean enabled;
        private List<String> platforms;
        private List<String> requiredFlags;
    }
}
