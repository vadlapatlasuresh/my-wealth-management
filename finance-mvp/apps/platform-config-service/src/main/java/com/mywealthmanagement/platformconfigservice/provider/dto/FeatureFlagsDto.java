package com.mywealthmanagement.platformconfigservice.provider.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class FeatureFlagsDto {
    private Map<String, Boolean> flags;
}
