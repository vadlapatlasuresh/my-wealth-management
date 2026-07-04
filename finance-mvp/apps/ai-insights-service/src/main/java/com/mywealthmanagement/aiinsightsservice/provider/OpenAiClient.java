package com.mywealthmanagement.aiinsightsservice.provider;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Thin client over the OpenAI Chat Completions API (ChatGPT / GPT models).
 * <p>
 * Mirrors {@link AnthropicClient} and {@link GeminiClient}: reads its configuration from
 * {@code openai.*} properties, wired from the {@code OPENAI_API_KEY} and {@code OPENAI_MODEL}
 * environment variables in production. A single {@link #complete(String, String)} call sends
 * one system message + one user message and returns the assistant's text content.
 * <p>
 * The API key travels only in the {@code Authorization: Bearer} header, never in the URL.
 */
@Component
public class OpenAiClient {

    private final RestClient restClient;
    private final String apiKey;
    private final String model;
    private final int maxTokens;

    public OpenAiClient(
            @Value("${openai.base-url:https://api.openai.com}") String baseUrl,
            @Value("${openai.api-key:${OPENAI_API_KEY:}}") String apiKey,
            @Value("${openai.model:gpt-4o}") String model,
            @Value("${openai.max-tokens:1024}") int maxTokens) {
        this.apiKey = apiKey;
        this.model = model;
        this.maxTokens = maxTokens;
        this.restClient = RestClient.builder().baseUrl(baseUrl)
                .requestFactory(HttpTimeouts.ai()).build();
    }

    /** True when an API key is present, i.e. real calls can be made. */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * Send one system + user message to ChatGPT and return its text reply.
     *
     * @throws org.springframework.web.client.RestClientException on transport/API errors
     */
    public String complete(String system, String userMessage) {
        Map<String, Object> body = Map.of(
                "model", model,
                "max_tokens", maxTokens,
                "messages", List.of(
                        Map.of("role", "system", "content", system),
                        Map.of("role", "user", "content", userMessage)
                )
        );

        JsonNode response = restClient.post()
                .uri("/v1/chat/completions")
                .header("Authorization", "Bearer " + apiKey)
                .header("content-type", "application/json")
                .body(body)
                .retrieve()
                .body(JsonNode.class);

        if (response == null) {
            return "";
        }
        // choices[0].message.content
        JsonNode content = response.path("choices").path(0).path("message").path("content");
        return content.isMissingNode() || content.isNull() ? "" : content.asText().trim();
    }
}
