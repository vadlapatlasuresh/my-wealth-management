package com.mywealthmanagement.aiinsightsservice.provider;

import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.http.client.ClientHttpRequestFactory;

import java.time.Duration;

/**
 * Bounded HTTP timeouts for outbound AI provider calls (Gemini/Anthropic/OpenAI). The read
 * timeout is generous (LLM generation is slow) but finite, so a stuck provider eventually
 * fails instead of pinning a request thread forever.
 */
public final class HttpTimeouts {

    private static final Duration CONNECT = Duration.ofSeconds(5);
    private static final Duration READ = Duration.ofSeconds(60);

    private HttpTimeouts() {
    }

    public static ClientHttpRequestFactory ai() {
        return ClientHttpRequestFactories.get(
                ClientHttpRequestFactorySettings.DEFAULTS
                        .withConnectTimeout(CONNECT)
                        .withReadTimeout(READ));
    }
}
