package com.mywealthmanagement.notificationservice.comms;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Registry/router that selects the active {@link ChannelProvider} per {@link Channel}.
 *
 * Selection is config-driven. For each channel the active provider name is read from:
 *   comms.provider.sms,  comms.provider.email,  comms.provider.push,  comms.provider.inapp
 * and matched against {@link ChannelProvider#name()}. Defaults to "mock" (and "inapp"
 * for IN_APP). All ChannelProvider beans are auto-discovered, so adding a new provider
 * is just: create the bean + flip the property. No change here.
 *
 * Example — switch SMS to Twilio:
 *   1. Add TwilioSmsProvider implements ChannelProvider (channel()=SMS, name()="twilio").
 *   2. Set comms.provider.sms=twilio in application.properties.
 *   No other code changes.
 */
@Component
public class ChannelRouter {

    private static final Logger log = LoggerFactory.getLogger(ChannelRouter.class);

    private final List<ChannelProvider> providers;
    private final Environment env;

    private final Map<Channel, ChannelProvider> active = new EnumMap<>(Channel.class);

    public ChannelRouter(List<ChannelProvider> providers, Environment env) {
        this.providers = providers;
        this.env = env;
    }

    @PostConstruct
    void resolveActiveProviders() {
        for (Channel channel : Channel.values()) {
            String defaultName = channel == Channel.IN_APP ? "inapp" : "mock";
            String wanted = env.getProperty("comms.provider." + propertyKey(channel), defaultName);

            ChannelProvider chosen = providers.stream()
                    .filter(p -> p.channel() == channel && p.name().equalsIgnoreCase(wanted))
                    .findFirst()
                    .orElseGet(() -> providers.stream()
                            .filter(p -> p.channel() == channel)
                            .findFirst()
                            .orElse(null));

            if (chosen == null) {
                log.warn("[ChannelRouter] No provider registered for channel {}", channel);
                continue;
            }
            if (!chosen.name().equalsIgnoreCase(wanted)) {
                log.warn("[ChannelRouter] Requested provider '{}' for {} not found; falling back to '{}'",
                        wanted, channel, chosen.name());
            }
            active.put(channel, chosen);
            log.info("[ChannelRouter] {} -> provider '{}' ({})",
                    channel, chosen.name(), chosen.getClass().getSimpleName());
        }
    }

    /** Active provider for the given channel, or null if none registered. */
    public ChannelProvider providerFor(Channel channel) {
        return active.get(channel);
    }

    private String propertyKey(Channel channel) {
        return channel == Channel.IN_APP ? "inapp" : channel.name().toLowerCase();
    }
}
