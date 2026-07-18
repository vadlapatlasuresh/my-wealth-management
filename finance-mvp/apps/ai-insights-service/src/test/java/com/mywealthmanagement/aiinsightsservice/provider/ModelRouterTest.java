package com.mywealthmanagement.aiinsightsservice.provider;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the chat {@link ModelRouter} without any network calls. With no API keys
 * configured, every real model reports {@code isConfigured() == false}, so the router must
 * degrade cleanly to the deterministic {@link MockAiProvider} — for both Auto Mode and an
 * explicit manual model choice — and always attach the educational disclaimer.
 */
class ModelRouterTest {

    private ModelRouter unconfiguredRouter() {
        AnthropicClient anthropic = new AnthropicClient(
                "https://api.anthropic.com", "", "claude-opus-4-8", "2023-06-01", 1024);
        GeminiClient gemini = new GeminiClient(
                "https://generativelanguage.googleapis.com", "", "gemini-flash-latest", 2048, 0);
        OpenAiClient openai = new OpenAiClient(
                "https://api.openai.com", "", "gpt-4o", 1024);
        FinancialSummaryClient summary = new FinancialSummaryClient("http://localhost:8080");
        return new ModelRouter(anthropic, gemini, openai, summary, new MockAiProvider(), 60000);
    }

    @Test
    void autoMode_fallsBackToMock_whenNoModelConfigured() {
        ModelRouter router = unconfiguredRouter();

        ModelRouter.ChatResult result = router.chat("How should I pay off my debt?", List.of(), "auto");

        assertThat(result.reply()).contains("debt");
        assertThat(result.reply()).contains("Educational information, not personalized financial advice.");
        // No real model answered, so the offline assistant is credited.
        assertThat(result.model()).isEqualTo("Assistant");
    }

    @Test
    void manualPick_fallsBackToMock_whenChosenModelUnavailable() {
        ModelRouter router = unconfiguredRouter();

        ModelRouter.ChatResult result = router.chat("Where am I overspending?", List.of(), "claude");

        assertThat(result.reply()).isNotBlank();
        assertThat(result.model()).isEqualTo("Assistant");
    }

    @Test
    void unknownModel_isTreatedAsAuto() {
        ModelRouter router = unconfiguredRouter();

        ModelRouter.ChatResult result = router.chat("Summarize my financial health", List.of(), "grok-9000");

        assertThat(result.reply()).isNotBlank();
        assertThat(result.model()).isEqualTo("Assistant");
    }
}
