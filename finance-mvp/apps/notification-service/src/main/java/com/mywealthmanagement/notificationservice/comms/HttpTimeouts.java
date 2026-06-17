package com.mywealthmanagement.notificationservice.comms;

import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.http.client.ClientHttpRequestFactory;

import java.time.Duration;

/**
 * Bounded HTTP timeouts for outbound third-party provider calls (SendGrid/Twilio/FCM), so a
 * hung or slow provider fails fast instead of pinning a request thread indefinitely.
 */
public final class HttpTimeouts {

    private static final Duration CONNECT = Duration.ofSeconds(5);
    private static final Duration READ = Duration.ofSeconds(10);

    private HttpTimeouts() {
    }

    public static ClientHttpRequestFactory provider() {
        return ClientHttpRequestFactories.get(
                ClientHttpRequestFactorySettings.DEFAULTS
                        .withConnectTimeout(CONNECT)
                        .withReadTimeout(READ));
    }
}
