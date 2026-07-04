package com.mywealthmanagement.aiinsightsservice.provider;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the assistant's shared system prompt: it must cover every financial area, keep the
 * PII/NPI guardrail, close on the exact disclaimer, and fold in the snapshot when present.
 */
class SystemPromptsTest {

    @Test
    void chat_coversAllFinancialAreas_andGuardrails() {
        String p = SystemPrompts.chat("");

        assertThat(p).contains("Net worth", "Cash", "Investments", "Real estate",
                "Business", "Debt", "Budgets", "Transactions");
        // The four response beats.
        assertThat(p).contains("SUMMARY", "TRENDS", "ALERTS", "RECOMMENDATIONS");
        // PII/NPI guardrail and the mandatory closing line.
        assertThat(p).contains("NO names, account numbers");
        assertThat(p).contains(SystemPrompts.DISCLAIMER);
    }

    @Test
    void chat_includesSnapshot_whenProvided() {
        String snapshot = "- Net worth: $123,456\n- Cash: $10,000";
        String p = SystemPrompts.chat(snapshot);

        assertThat(p).contains(snapshot);
        assertThat(p).contains("PII-free");
    }

    @Test
    void insights_requestsStrictJsonContract() {
        String p = SystemPrompts.insights();

        assertThat(p).contains("JSON array");
        assertThat(p).contains("\"severity\"");
        assertThat(p).contains("INFO", "WARNING", "ACTIONABLE");
    }
}
