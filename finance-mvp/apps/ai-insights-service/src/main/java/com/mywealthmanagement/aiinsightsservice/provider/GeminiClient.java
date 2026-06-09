package com.mywealthmanagement.aiinsightsservice.provider;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Thin client over the Google Gemini (Generative Language) API.
 * <p>
 * Reads its configuration from {@code gemini.*} / {@code gemini.model} properties,
 * wired from the {@code GEMINI_API_KEY} and {@code GEMINI_MODEL} environment variables
 * in production. A single {@link #complete(String, String)} call sends one system
 * instruction + one user message and returns the concatenated text content.
 * <p>
 * Auth uses the {@code x-goog-api-key} header (works with both classic {@code AIza...}
 * keys and the newer {@code AQ....} keys), so the key never appears in the URL or logs.
 */
@Component
public class GeminiClient {

    private final RestClient restClient;
    private final String apiKey;
    private final String model;
    private final int maxTokens;
    private final int thinkingBudget;

    public GeminiClient(
            @Value("${gemini.base-url:https://generativelanguage.googleapis.com}") String baseUrl,
            @Value("${gemini.api-key:${GEMINI_API_KEY:}}") String apiKey,
            @Value("${gemini.model:gemini-2.5-flash}") String model,
            @Value("${gemini.max-tokens:2048}") int maxTokens,
            // 2.5-flash "thinks" by default, which consumes the output budget; 0 disables it
            // for fast, predictable replies. Set to -1 to omit thinkingConfig entirely
            // (for models that don't accept it).
            @Value("${gemini.thinking-budget:0}") int thinkingBudget) {
        this.apiKey = apiKey;
        this.model = model;
        this.maxTokens = maxTokens;
        this.thinkingBudget = thinkingBudget;
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    /** True when an API key is present, i.e. real calls can be made. */
    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * Send one system instruction + user message to Gemini and return its text reply.
     *
     * @throws org.springframework.web.client.RestClientException on transport/API errors
     */
    public String complete(String system, String userMessage) {
        Map<String, Object> generationConfig = new java.util.HashMap<>();
        generationConfig.put("maxOutputTokens", maxTokens);
        // On 2.5+ models, cap/disable "thinking" so it doesn't consume the output budget.
        if (thinkingBudget >= 0) {
            generationConfig.put("thinkingConfig", Map.of("thinkingBudget", thinkingBudget));
        }

        Map<String, Object> body = Map.of(
                "system_instruction", Map.of(
                        "parts", List.of(Map.of("text", system))
                ),
                "contents", List.of(Map.of(
                        "role", "user",
                        "parts", List.of(Map.of("text", userMessage))
                )),
                "generationConfig", generationConfig
        );

        JsonNode response = restClient.post()
                .uri("/v1beta/models/{model}:generateContent", model)
                .header("x-goog-api-key", apiKey)
                .header("content-type", "application/json")
                .body(body)
                .retrieve()
                .body(JsonNode.class);

        if (response == null) {
            return "";
        }
        // candidates[0].content.parts[*].text — concatenate all text parts.
        JsonNode parts = response.path("candidates").path(0).path("content").path("parts");
        StringBuilder out = new StringBuilder();
        if (parts.isArray()) {
            for (JsonNode part : parts) {
                if (part.hasNonNull("text")) {
                    out.append(part.get("text").asText());
                }
            }
        }
        return out.toString().trim();
    }
}
