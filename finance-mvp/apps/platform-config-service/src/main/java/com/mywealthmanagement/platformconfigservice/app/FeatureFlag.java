package com.mywealthmanagement.platformconfigservice.app;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "feature_flag")
@Data
@NoArgsConstructor
public class FeatureFlag {

    @Id
    @Column(name = "flag_key", length = 200)
    private String flagKey;

    @Column(name = "enabled")
    private Boolean enabled;
}
