package com.mywealthmanagement.platformconfigservice.app;

import com.mywealthmanagement.platformconfigservice.provider.ConfigProvider;
import com.mywealthmanagement.platformconfigservice.provider.dto.AppConfigDto;
import com.mywealthmanagement.platformconfigservice.provider.dto.FeatureFlagsDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/config")
@RequiredArgsConstructor
public class ConfigController {

    private final ConfigProvider configProvider;

    @GetMapping("/app")
    public ResponseEntity<AppConfigDto> getAppConfig(
            @RequestParam(value = "platform", required = false, defaultValue = "web") String platform) {
        return ResponseEntity.ok(configProvider.getAppConfig(platform));
    }

    @GetMapping("/flags")
    public ResponseEntity<FeatureFlagsDto> getFlags() {
        return ResponseEntity.ok(configProvider.getFeatureFlags());
    }
}
