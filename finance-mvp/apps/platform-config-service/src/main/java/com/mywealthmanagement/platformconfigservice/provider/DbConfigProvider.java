package com.mywealthmanagement.platformconfigservice.provider;

import com.mywealthmanagement.platformconfigservice.app.*;
import com.mywealthmanagement.platformconfigservice.content.Disclaimer;
import com.mywealthmanagement.platformconfigservice.content.DisclaimerRepository;
import com.mywealthmanagement.platformconfigservice.provider.dto.AppConfigDto;
import com.mywealthmanagement.platformconfigservice.provider.dto.DisclaimersDto;
import com.mywealthmanagement.platformconfigservice.provider.dto.FeatureFlagsDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Database-backed {@link ConfigProvider}. Reads config, flags and disclaimers from
 * the Flyway-seeded tables. This is the default/only provider today; a managed
 * provider (LaunchDarkly / Unleash) would be an alternate implementation of
 * {@link ConfigProvider} selected via configuration.
 */
@Component
@RequiredArgsConstructor
public class DbConfigProvider implements ConfigProvider {

    private static final String DEFAULT_LOCALE = "en";
    private static final String SETTING_THEME = "theme";
    private static final String SETTING_DASHBOARD_LAYOUT = "dashboardLayout";
    private static final String DEFAULT_APP_VERSION = "1";

    private final AppModuleRepository appModuleRepository;
    private final AppSectionRepository appSectionRepository;
    private final FeatureFlagRepository featureFlagRepository;
    private final AppSettingRepository appSettingRepository;
    private final DisclaimerRepository disclaimerRepository;

    @Override
    public AppConfigDto getAppConfig(String platform) {
        Map<String, String> settings = appSettingRepository.findAll().stream()
                .collect(Collectors.toMap(AppSetting::getSettingKey, s -> s.getSettingValue() == null ? "" : s.getSettingValue()));

        String theme = settings.getOrDefault(SETTING_THEME, "light");
        List<String> dashboardLayout = splitCsv(settings.get(SETTING_DASHBOARD_LAYOUT));

        List<AppConfigDto.SectionDto> sections = appSectionRepository.findAllByOrderBySortOrderAsc().stream()
                .map(s -> AppConfigDto.SectionDto.builder()
                        .id(s.getId())
                        .label(s.getLabel())
                        .order(s.getSortOrder())
                        .build())
                .collect(Collectors.toList());

        String version = DEFAULT_APP_VERSION;

        List<AppModule> allModules = appModuleRepository.findAllByOrderBySortOrderAsc();
        if (!allModules.isEmpty() && allModules.get(0).getAppConfigVersion() != null) {
            version = allModules.get(0).getAppConfigVersion();
        }

        List<AppConfigDto.ModuleDto> modules = allModules.stream()
                .filter(m -> {
                    List<String> platforms = splitCsv(m.getPlatforms());
                    return platform == null || platforms.contains(platform);
                })
                .map(m -> AppConfigDto.ModuleDto.builder()
                        .id(m.getId())
                        .title(m.getTitle())
                        .icon(m.getIcon())
                        .route(m.getRoute())
                        .section(m.getSection())
                        .order(m.getSortOrder())
                        .enabled(m.getEnabled())
                        .platforms(splitCsv(m.getPlatforms()))
                        .requiredFlags(splitCsv(m.getRequiredFlags()))
                        .build())
                .collect(Collectors.toList());

        return AppConfigDto.builder()
                .theme(theme)
                .version(version)
                .sections(sections)
                .modules(modules)
                .dashboardLayout(dashboardLayout)
                .build();
    }

    @Override
    public FeatureFlagsDto getFeatureFlags() {
        Map<String, Boolean> flags = new LinkedHashMap<>();
        featureFlagRepository.findAll().forEach(f ->
                flags.put(f.getFlagKey(), Boolean.TRUE.equals(f.getEnabled())));
        return new FeatureFlagsDto(flags);
    }

    @Override
    public DisclaimersDto getDisclaimers(List<String> keys, String locale) {
        String requestedLocale = (locale == null || locale.isBlank()) ? DEFAULT_LOCALE : locale;

        List<Disclaimer> found = fetch(keys, requestedLocale);
        // Fall back to default locale "en" if the requested locale has no entries.
        if (found.isEmpty() && !DEFAULT_LOCALE.equals(requestedLocale)) {
            found = fetch(keys, DEFAULT_LOCALE);
        }

        List<DisclaimersDto.DisclaimerItemDto> items = found.stream()
                .map(d -> DisclaimersDto.DisclaimerItemDto.builder()
                        .key(d.getDisclaimerKey())
                        .version(d.getVersion())
                        .locale(d.getLocale())
                        .title(d.getTitle())
                        .bodyMarkdown(d.getBodyMarkdown())
                        .requiresAcceptance(Boolean.TRUE.equals(d.getRequiresAcceptance()))
                        .build())
                .collect(Collectors.toList());

        return new DisclaimersDto(items);
    }

    private List<Disclaimer> fetch(List<String> keys, String locale) {
        if (keys == null || keys.isEmpty()) {
            return disclaimerRepository.findByLocale(locale);
        }
        return disclaimerRepository.findByLocaleAndDisclaimerKeyIn(locale, keys);
    }

    private static List<String> splitCsv(String csv) {
        if (csv == null || csv.isBlank()) {
            return new ArrayList<>();
        }
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }
}
