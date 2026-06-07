package com.mywealthmanagement.notificationservice.comms;

import java.util.Map;

/**
 * Provider seam: one concrete implementation per delivery integration
 * (e.g. MockSmsProvider, TwilioSmsProvider, MockEmailProvider, SendGridEmailProvider ...).
 *
 * Multiple providers may target the SAME {@link Channel}; the {@link ChannelRouter}
 * selects the active one per channel from configuration (comms.provider.&lt;channel&gt;)
 * by matching {@link #name()}. Swapping a provider is therefore a config change only.
 */
public interface ChannelProvider {

    /** The channel this provider delivers on. */
    Channel channel();

    /** Stable config key for this provider, e.g. "mock", "twilio", "sendgrid". */
    String name();

    /**
     * Deliver a rendered message.
     *
     * @param recipient channel-specific address (userId for IN_APP, email, phone, device token...)
     * @param subject   rendered subject (may be null for channels like SMS)
     * @param body      rendered body
     * @param meta      extra context (e.g. userId, templateKey, type) for the provider
     */
    DeliveryResult send(String recipient, String subject, String body, Map<String, Object> meta);
}
