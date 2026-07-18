package com.mywealthmanagement.aiinsightsservice.provider;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Live integration test for the Gemini client. Skipped unless a real key is present,
 * so normal CI never calls the external API:
 *
 *   GEMINI_API_KEY=your_key mvn -pl apps/ai-insights-service test -Dtest=GeminiLiveTest
 *
 * (or from inside apps/ai-insights-service:
 *   GEMINI_API_KEY=your_key mvn test -Dtest=GeminiLiveTest)
 *
 * It calls the real Gemini generateContent API and proves a non-empty completion
 * comes back. Optionally set GEMINI_MODEL to override the default model.
 */
@EnabledIfEnvironmentVariable(named = "GEMINI_API_KEY", matches = ".+")
class GeminiLiveTest {

    private GeminiClient liveClient() {
        String key = System.getenv("GEMINI_API_KEY");
        String model = System.getenv().getOrDefault("GEMINI_MODEL", "gemini-3.5-flash");
        // 2048 output tokens, thinking disabled (budget 0) — matches the app defaults.
        return new GeminiClient("https://generativelanguage.googleapis.com", key, model, 2048, 0);
    }

    @Test
    void completesAPrompt() {
        GeminiClient client = liveClient();
        assertThat(client.isConfigured()).isTrue();

        String reply = client.complete(
                "You are a test fixture. Reply with exactly one word and nothing else.",
                "Reply with the single word: OK");

        System.out.println("Gemini reply -> " + reply);
        assertThat(reply).isNotNull().isNotBlank();
    }

    @Test
    void returnsJsonArrayForInsightStyledPrompt() {
        GeminiClient client = liveClient();
        String reply = client.complete(
                "Respond with ONLY a JSON array of 2 objects, each with string fields \"title\" and \"reason\". "
                        + "No prose, no markdown fences.",
                "Give two short personal-finance tips for someone building an emergency fund.");

        System.out.println("Gemini insight reply -> " + reply);
        assertThat(reply).isNotBlank();
        assertThat(reply).contains("[").contains("]");
    }
}
