package com.mywealthmanagement.aiinsightsservice.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Real, Claude-backed {@link AiProvider}. Active only when {@code ai.provider=anthropic}
 * and marked {@link Primary} so it is injected ahead of {@link MockAiProvider} when present.
 * <p>
 * For both insights and chat it first pulls the user's real financial snapshot
 * ({@link FinancialSummaryClient}) and includes it as grounding context, so the model's
 * output reflects the user's actual numbers rather than generic advice. Any failure —
 * missing API key, network error, malformed model output — degrades gracefully to the
 * deterministic {@link MockAiProvider}, so the endpoint never hard-fails.
 */
@Service
@Primary
@ConditionalOnProperty(name = "ai.provider", havingValue = "anthropic")
public class AnthropicAiProvider implements AiProvider {

    private static final Logger log = LoggerFactory.getLogger(AnthropicAiProvider.class);
    private static final Set<String> VALID_SEVERITIES = Set.of("INFO", "WARNING", "ACTIONABLE");
    private static final String DISCLAIMER = SystemPrompts.DISCLAIMER;

    private final AnthropicClient anthropic;
    private final FinancialSummaryClient summaryClient;
    private final MockAiProvider fallback;
    private final ObjectMapper mapper = new ObjectMapper();

    public AnthropicAiProvider(AnthropicClient anthropic,
                               FinancialSummaryClient summaryClient,
                               MockAiProvider fallback) {
        this.anthropic = anthropic;
        this.summaryClient = summaryClient;
        this.fallback = fallback;
    }

    @Override
    public List<GeneratedInsight> generateInsights(Long userId) {
        if (!anthropic.isConfigured()) {
            log.warn("ai.provider=anthropic but no API key configured; falling back to mock insights.");
            return fallback.generateInsights(userId);
        }
        try {
            String summary = summaryClient.fetchSummaryText();
            String context = summary.isBlank()
                    ? "No financial snapshot was available for this user; give broadly applicable guidance."
                    : summary;

            String reply = anthropic.complete(SystemPrompts.insights(), context);
            List<GeneratedInsight> parsed = parseInsights(reply);
            if (parsed.isEmpty()) {
                log.warn("Claude returned no parseable insights; falling back to mock.");
                return fallback.generateInsights(userId);
            }
            return parsed;
        } catch (Exception e) {
            log.warn("Insight generation via Claude failed ({}); falling back to mock.", e.getMessage());
            return fallback.generateInsights(userId);
        }
    }

    @Override
    public String chat(String message, List<String> history) {
        if (!anthropic.isConfigured()) {
            return fallback.chat(message, history);
        }
        try {
            String summary = summaryClient.fetchSummaryText();
            String system = SystemPrompts.chat(summary);

            String userMessage = buildUserMessage(message, history);
            String reply = anthropic.complete(system, userMessage);
            if (reply == null || reply.isBlank()) {
                return fallback.chat(message, history);
            }
            if (!reply.contains(DISCLAIMER)) {
                reply = reply + "\n\n" + DISCLAIMER;
            }
            return reply;
        } catch (Exception e) {
            log.warn("Chat via Claude failed ({}); falling back to mock.", e.getMessage());
            return fallback.chat(message, history);
        }
    }

    /** Fold any prior turns into the message so the single-shot call has conversational context. */
    private String buildUserMessage(String message, List<String> history) {
        String current = (message == null) ? "" : message;
        if (history == null || history.isEmpty()) {
            return current;
        }
        StringBuilder sb = new StringBuilder("Conversation so far:\n");
        for (String turn : history) {
            sb.append(turn).append("\n");
        }
        sb.append("\nCurrent question:\n").append(current);
        return sb.toString();
    }

    /** Parse Claude's JSON array reply into insights, tolerating markdown fences and stray prose. */
    private List<GeneratedInsight> parseInsights(String reply) {
        List<GeneratedInsight> insights = new ArrayList<>();
        if (reply == null || reply.isBlank()) {
            return insights;
        }
        String json = extractJsonArray(reply);
        if (json == null) {
            return insights;
        }
        try {
            JsonNode array = mapper.readTree(json);
            if (!array.isArray()) {
                return insights;
            }
            for (JsonNode node : array) {
                String title = node.path("title").asText("").trim();
                String reason = node.path("reason").asText("").trim();
                String action = node.path("suggestedAction").asText("").trim();
                String severity = node.path("severity").asText("INFO").trim().toUpperCase();
                if (!VALID_SEVERITIES.contains(severity)) {
                    severity = "INFO";
                }
                if (title.isEmpty() || reason.isEmpty()) {
                    continue;
                }
                insights.add(GeneratedInsight.builder()
                        .title(title)
                        .reason(reason)
                        .severity(severity)
                        .suggestedAction(action)
                        .build());
            }
        } catch (Exception e) {
            log.warn("Failed to parse Claude insight JSON: {}", e.getMessage());
        }
        return insights;
    }

    /** Pull the outermost {@code [...]} array out of a reply that may include fences or prose. */
    private String extractJsonArray(String reply) {
        int start = reply.indexOf('[');
        int end = reply.lastIndexOf(']');
        if (start >= 0 && end > start) {
            return reply.substring(start, end + 1);
        }
        return null;
    }
}
