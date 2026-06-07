package com.mywealthmanagement.aiinsightsservice.provider;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the most important safety property of the real Claude-backed provider:
 * when no API key is configured (or the model is otherwise unavailable) it degrades
 * cleanly to the deterministic {@link MockAiProvider} instead of failing the request.
 * <p>
 * These tests make NO network calls — the {@link AnthropicClient} is constructed with
 * a blank API key, so {@code isConfigured()} is false and the fallback path is taken.
 */
class AnthropicAiProviderTest {

    private AnthropicAiProvider unconfiguredProvider() {
        // Blank API key -> AnthropicClient.isConfigured() == false -> fallback path.
        AnthropicClient client = new AnthropicClient(
                "https://api.anthropic.com", "", "claude-opus-4-8", "2023-06-01", 1024);
        FinancialSummaryClient summaryClient = new FinancialSummaryClient("http://localhost:8080");
        return new AnthropicAiProvider(client, summaryClient, new MockAiProvider());
    }

    @Test
    void generateInsights_fallsBackToMock_whenNotConfigured() {
        AnthropicAiProvider provider = unconfiguredProvider();

        List<GeneratedInsight> insights = provider.generateInsights(1L);

        // Mock provider yields a non-empty curated set with valid severities.
        assertThat(insights).isNotEmpty();
        assertThat(insights).allSatisfy(i -> {
            assertThat(i.getTitle()).isNotBlank();
            assertThat(i.getReason()).isNotBlank();
            assertThat(i.getSeverity()).isIn("INFO", "WARNING", "ACTIONABLE");
        });
    }

    @Test
    void chat_fallsBackToMock_andKeepsDisclaimer_whenNotConfigured() {
        AnthropicAiProvider provider = unconfiguredProvider();

        String reply = provider.chat("How should I pay off my debt?", List.of());

        assertThat(reply).isNotBlank();
        // The fallback's debt response and the mandatory educational disclaimer are present.
        assertThat(reply).contains("debt");
        assertThat(reply).contains("Educational information, not personalized financial advice.");
    }
}
