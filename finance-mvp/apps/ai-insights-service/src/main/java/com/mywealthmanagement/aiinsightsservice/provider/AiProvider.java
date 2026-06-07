package com.mywealthmanagement.aiinsightsservice.provider;

import java.util.List;

/**
 * Abstraction over an AI insights + chat backend.
 * <p>
 * The default implementation ({@link MockAiProvider}) is fully self-contained and
 * performs NO network calls. A production implementation would call an LLM
 * (e.g. Anthropic Claude or OpenAI) over the user's financial summary.
 */
public interface AiProvider {

    /**
     * Produce a curated set of personal-finance insights for the given user.
     */
    List<GeneratedInsight> generateInsights(Long userId);

    /**
     * Produce a conversational reply to the user's message, optionally using prior turns.
     */
    String chat(String message, List<String> history);
}
