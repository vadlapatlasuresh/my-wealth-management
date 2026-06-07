package com.mywealthmanagement.platformconfigservice.provider;

import com.mywealthmanagement.platformconfigservice.provider.dto.AppConfigDto;
import com.mywealthmanagement.platformconfigservice.provider.dto.DisclaimersDto;
import com.mywealthmanagement.platformconfigservice.provider.dto.FeatureFlagsDto;

import java.util.List;

/**
 * Provider seam for platform configuration, feature flags and disclaimer content.
 *
 * <p>The bundled {@link DbConfigProvider} reads everything from the local database
 * (Flyway-seeded tables). This interface exists so a managed flag/config provider
 * (e.g. LaunchDarkly or Unleash) could be swapped in later without touching the
 * controllers: a new {@code LaunchDarklyConfigProvider} would implement this
 * interface and be selected via configuration. Keep this contract provider-agnostic.
 */
public interface ConfigProvider {

    /**
     * Returns the app config for a platform (web|ios|android). Modules are filtered
     * to those whose platform list contains {@code platform} and ordered by their order.
     */
    AppConfigDto getAppConfig(String platform);

    /** Returns all feature flags and their enabled state. */
    FeatureFlagsDto getFeatureFlags();

    /**
     * Returns disclaimer content for the requested locale, optionally filtered by keys.
     * Falls back to locale "en" when the requested locale has no entries.
     *
     * @param keys   disclaimer keys to include, or {@code null}/empty for all
     * @param locale requested locale, e.g. "en"
     */
    DisclaimersDto getDisclaimers(List<String> keys, String locale);
}
