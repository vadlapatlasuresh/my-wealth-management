package com.mywealthmanagement.platformconfigservice.app;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "app_setting")
@Data
@NoArgsConstructor
public class AppSetting {

    @Id
    @Column(name = "setting_key", length = 200)
    private String settingKey;

    @Column(name = "setting_value", length = 4000)
    private String settingValue;
}
