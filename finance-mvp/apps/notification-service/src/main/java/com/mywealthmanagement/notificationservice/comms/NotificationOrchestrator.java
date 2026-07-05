package com.mywealthmanagement.notificationservice.comms;

import com.mywealthmanagement.notificationservice.comms.template.MessageTemplate;
import com.mywealthmanagement.notificationservice.comms.template.MessageTemplateRepository;
import com.mywealthmanagement.notificationservice.comms.template.TemplateRenderer;
import com.mywealthmanagement.notificationservice.notification.NotificationPreference;
import com.mywealthmanagement.notificationservice.notification.NotificationPreferenceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Generic dispatch pipeline:
 *   resolve template (key+channel+locale, fallback locale en, latest enabled version)
 *   -> respect user preferences (skip disabled channels)
 *   -> respect quiet hours (defer/skip PUSH & SMS)
 *   -> render {{vars}}
 *   -> send via the channel's config-selected active provider.
 *
 * Best-effort: one channel failing or skipping does not abort the others.
 * Optional idempotencyKey: a repeat (per user) returns the prior result set.
 */
@Service
public class NotificationOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(NotificationOrchestrator.class);
    private static final String FALLBACK_LOCALE = "en";

    private final MessageTemplateRepository templateRepository;
    private final NotificationPreferenceRepository preferenceRepository;
    private final TemplateRenderer renderer;
    private final ChannelRouter router;

    /** comms.quietHours e.g. "22-7" (10pm..7am). Empty/blank disables quiet hours. */
    @Value("${comms.quietHours:}")
    private String quietHours;

    private final NotificationIdempotencyRepository idempotencyRepository;

    public NotificationOrchestrator(MessageTemplateRepository templateRepository,
                                    NotificationPreferenceRepository preferenceRepository,
                                    TemplateRenderer renderer,
                                    ChannelRouter router,
                                    NotificationIdempotencyRepository idempotencyRepository) {
        this.templateRepository = templateRepository;
        this.preferenceRepository = preferenceRepository;
        this.renderer = renderer;
        this.router = router;
        this.idempotencyRepository = idempotencyRepository;
    }

    public List<DeliveryResult> dispatch(Long userId,
                                         String templateKey,
                                         List<Channel> channelsRequested,
                                         Map<String, Object> vars,
                                         String locale,
                                         String idempotencyKey) {

        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            try {
                // Reserve the key BEFORE dispatching (persistent, survives restarts). A concurrent
                // or replayed request collides on the UNIQUE constraint and is treated as a replay.
                idempotencyRepository.saveAndFlush(new NotificationIdempotency(userId, idempotencyKey));
            } catch (DataIntegrityViolationException duplicate) {
                log.info("[Orchestrator] Idempotent replay userId={} key={} -> skipping re-dispatch", userId, idempotencyKey);
                return List.of(DeliveryResult.sent(Channel.IN_APP, "idempotent-replay",
                        "Already processed (idempotent replay)"));
            }
        }

        String effectiveLocale = (locale == null || locale.isBlank()) ? FALLBACK_LOCALE : locale;
        List<Channel> channels = (channelsRequested == null || channelsRequested.isEmpty())
                ? List.of(Channel.IN_APP)
                : channelsRequested;

        NotificationPreference prefs = preferenceRepository.findByUserId(userId).orElse(null);
        Map<String, Object> meta = buildMeta(userId, templateKey, vars);

        List<DeliveryResult> results = new ArrayList<>();
        for (Channel channel : channels) {
            try {
                results.add(dispatchOne(userId, templateKey, channel, effectiveLocale, vars, prefs, meta));
            } catch (Exception e) {
                log.warn("[Orchestrator] channel {} failed for userId={} template={}: {}",
                        channel, userId, templateKey, e.getMessage());
                results.add(DeliveryResult.failed(channel, "Unexpected error: " + e.getMessage()));
            }
        }

        return results;
    }

    private DeliveryResult dispatchOne(Long userId, String templateKey, Channel channel, String locale,
                                       Map<String, Object> vars, NotificationPreference prefs,
                                       Map<String, Object> meta) {

        if (!preferenceAllows(channel, prefs)) {
            log.info("[Orchestrator] Skipping {} for userId={}: disabled in preferences", channel, userId);
            return DeliveryResult.skipped(channel, "Channel disabled in user preferences");
        }

        if (isQuietHourBlocked(channel)) {
            log.info("[Orchestrator] Deferring {} for userId={}: within quiet hours ({})", channel, userId, quietHours);
            return DeliveryResult.skipped(channel, "Deferred: within quiet hours " + quietHours);
        }

        MessageTemplate template = resolveTemplate(templateKey, channel, locale).orElse(null);
        if (template == null) {
            log.info("[Orchestrator] No template for key={} channel={} locale={}", templateKey, channel, locale);
            return DeliveryResult.skipped(channel, "No enabled template for " + templateKey + "/" + channel);
        }

        ChannelProvider provider = router.providerFor(channel);
        if (provider == null) {
            return DeliveryResult.failed(channel, "No provider registered for channel");
        }

        String subject = renderer.render(template.getSubject(), vars);
        String body = renderer.render(template.getBody(), vars);
        String recipient = recipientFor(channel, userId);

        return provider.send(recipient, subject, body, meta);
    }

    /** Resolve by requested locale, then fall back to "en", latest enabled version. */
    private Optional<MessageTemplate> resolveTemplate(String key, Channel channel, String locale) {
        Optional<MessageTemplate> found = templateRepository
                .findFirstByTemplateKeyAndChannelAndLocaleAndEnabledTrueOrderByVersionDesc(key, channel, locale);
        if (found.isPresent() || FALLBACK_LOCALE.equals(locale)) {
            return found;
        }
        return templateRepository
                .findFirstByTemplateKeyAndChannelAndLocaleAndEnabledTrueOrderByVersionDesc(key, channel, FALLBACK_LOCALE);
    }

    /**
     * Channel-level opt-in/out. EMAIL, PUSH and SMS each have an explicit toggle;
     * IN_APP is always allowed (the in-app inbox is the fallback of record).
     */
    private boolean preferenceAllows(Channel channel, NotificationPreference prefs) {
        if (prefs == null) {
            return true;
        }
        return switch (channel) {
            case EMAIL -> prefs.isEmailEnabled();
            case PUSH -> prefs.isPushEnabled();
            case SMS -> prefs.isSmsEnabled();
            case IN_APP -> true;
        };
    }

    /** Quiet hours only gate intrusive channels (PUSH, SMS). */
    private boolean isQuietHourBlocked(Channel channel) {
        if (channel != Channel.PUSH && channel != Channel.SMS) {
            return false;
        }
        if (quietHours == null || quietHours.isBlank() || !quietHours.contains("-")) {
            return false;
        }
        try {
            String[] parts = quietHours.split("-");
            int start = Integer.parseInt(parts[0].trim());
            int end = Integer.parseInt(parts[1].trim());
            int hour = LocalTime.now().getHour();
            // window may wrap past midnight, e.g. 22-7
            if (start <= end) {
                return hour >= start && hour < end;
            }
            return hour >= start || hour < end;
        } catch (RuntimeException e) {
            log.warn("[Orchestrator] Invalid comms.quietHours='{}'; ignoring", quietHours);
            return false;
        }
    }

    private String recipientFor(Channel channel, Long userId) {
        // IN_APP routes by userId. Real EMAIL/SMS/PUSH would look up a contact/device;
        // for the mock layer the userId is a sufficient stand-in.
        return String.valueOf(userId);
    }

    private Map<String, Object> buildMeta(Long userId, String templateKey, Map<String, Object> vars) {
        Map<String, Object> meta = new HashMap<>();
        meta.put("userId", userId);
        meta.put("templateKey", templateKey);
        // derive an in-app "type" from the template key prefix (bill.* -> PAYMENT, budget.* -> BUDGET)
        meta.put("type", deriveType(templateKey));
        if (vars != null) {
            meta.put("vars", vars);
        }
        return meta;
    }

    private String deriveType(String templateKey) {
        if (templateKey == null) {
            return "SYSTEM";
        }
        if (templateKey.startsWith("bill")) {
            return "PAYMENT";
        }
        if (templateKey.startsWith("budget")) {
            return "BUDGET";
        }
        return "SYSTEM";
    }
}
