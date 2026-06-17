package com.mywealthmanagement.aiinsightsservice.provider;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Thin client over the Anthropic Messages API (Claude).
 * <p>
 * Reads its configuration from {@code anthropic.*} / {@code ai.model} properties,
 * which are wired from the {@code ANTHROPIC_API_KEY} and {@code AI_MODEL} environment
 * variables in production. A single {@link #complete(String, String)} call sends one
 * system prompt + one user message and returns the concatenated text content.
 */
@Component
public class AnthropicClient {

    private final RestClient restClient;
    private final String apiKey;
    private final String model;
    private final String version;
    private final int maxTokens;

    public AnthropicClient(
            @Value("${anthropic.base-url:https://api.anthropic.com}") String baseUrl,
            @Value("${anthropic.api-key:${ANTHROPIC_API_KEY:}}") String apiKey,
            @Value("${ai.model:claude-opus-4-8}") String model,
            @Value("${anthropic.version:2023-06-01}") String version,
            @Value("${anthropic.max-tokens:1024}") int maxTokens) {
        this.apiKey = apiKey;
        this.model = model;
        this.version = version;
        this.maxTokens = maxTokens;
        this.restClient = RestClient.builder().baseUrl(baseUrl)
                .requestFactory(HttpTimeouts.ai()).build();
    }

    /** True when an API key is present, i.e. real calls can be made. */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * Send one system + user message to Claude and return its text reply.
     *
     * @throws org.springframework.web.client.RestClientException on transport/API errors
     */
    public String complete(String system, String userMessage) {
        Map<String, Object> body = Map.of(
                "model", model,
                "max_tokens", maxTokens,
                "system", system,
                "messages", List.of(Map.of(
                        "role", "user",
                        "content", userMessage
                ))
        );

        JsonNode response = restClient.post()
                .uri("/v1/messages")
                .header("x-api-key", apiKey)
                .header("anthropic-version", version)
                .header("content-type", "application/json")
                .body(body)
                .retrieve()
                .body(JsonNode.class);

        if (response == null) {
            return "";
        }
        JsonNode content = response.path("content");
        StringBuilder out = new StringBuilder();
        if (content.isArray()) {
            for (JsonNode block : content) {
                if ("text".equals(block.path("type").asText())) {
                    out.append(block.path("text").asText());
                }
            }
        }
        return out.toString().trim();
    }
}
