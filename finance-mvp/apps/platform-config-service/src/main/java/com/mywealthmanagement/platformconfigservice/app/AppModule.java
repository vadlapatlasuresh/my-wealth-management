package com.mywealthmanagement.platformconfigservice.app;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "app_module")
@Data
@NoArgsConstructor
public class AppModule {

    @Id
    @Column(name = "id", length = 100)
    private String id;

    @Column(name = "title")
    private String title;

    @Column(name = "icon")
    private String icon;

    @Column(name = "route")
    private String route;

    @Column(name = "section")
    private String section;

    @Column(name = "sort_order")
    private Integer sortOrder;

    @Column(name = "enabled")
    private Boolean enabled;

    // Comma-separated list of platforms, e.g. "web,ios,android"
    @Column(name = "platforms")
    private String platforms;

    // Comma-separated list of feature flag keys required for this module
    @Column(name = "required_flags")
    private String requiredFlags;

    @Column(name = "app_config_version")
    private String appConfigVersion;
}
