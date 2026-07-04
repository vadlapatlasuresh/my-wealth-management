package com.mywealthmanagement.aiinsightsservice.provider;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Routes a chat turn to the best available AI model, powering the assistant's "Auto Mode"
 * as well as manual model switching.
 * <p>
 * Unlike the config-gated {@link AnthropicAiProvider}/{@link GeminiAiProvider} (which pick one
 * provider at startup for the insights path), the router owns all three chat clients — Claude,
 * Gemini, and ChatGPT — at once, so the user can switch models mid-conversation without any
 * restart. Every model shares the exact same {@link SystemPrompts#chat(String) system prompt}
 * and the same PII-free financial snapshot, so switching never changes the assistant's tone,
 * guardrails, or the data it sees — only the engine behind the reply. Chat history is carried in
 * the request from the client, so it is preserved across switches automatically.
 * <p>
 * AUTO MODE weighs, per turn:
 * <ul>
 *   <li><b>Task complexity</b> — estimated from the message; harder asks favor stronger reasoning.</li>
 *   <li><b>Cost</b> and <b>response speed</b> — cheaper/faster models win easy asks.</li>
 *   <li><b>Availability &amp; uptime</b> — a model that just failed is put in a short cooldown
 *       (a lightweight circuit breaker) and skipped until it recovers.</li>
 * </ul>
 * Whatever the choice, a failed call falls through to the next-best model and ultimately to the
 * always-on {@link MockAiProvider}, so the endpoint never hard-fails.
 */
@Service
public class ModelRouter {

    private static final Logger log = LoggerFactory.getLogger(ModelRouter.class);

    /** Canonical model keys understood in requests. */
    public static final String AUTO = "auto";
    public static final String CLAUDE = "claude";
    public static final String GEMINI = "gemini";
    public static final String CHATGPT = "chatgpt";

    private final FinancialSummaryClient summaryClient;
    private final MockAiProvider fallback;
    private final List<Model> models = new ArrayList<>();

    /** How long a model stays benched after a failure before Auto Mode reconsiders it. */
    private final long cooldownMs;
    /** Last-failure timestamp per model key; absent means healthy. */
    private final ConcurrentHashMap<String, Long> lastFailure = new ConcurrentHashMap<>();

    public ModelRouter(AnthropicClient anthropic,
                       GeminiClient gemini,
                       OpenAiClient openai,
                       FinancialSummaryClient summaryClient,
                       MockAiProvider fallback,
                       @Value("${ai.router.cooldown-ms:60000}") long cooldownMs) {
        this.summaryClient = summaryClient;
        this.fallback = fallback;
        this.cooldownMs = cooldownMs;

        // Heuristic model profiles (0..1). Tunable — reasoning strength vs. cheapness vs. speed.
        // Rough of thumb: simple asks -> Gemini (cheap, fast); complex asks -> Claude (strongest
        // reasoning); ChatGPT sits in the balanced middle.
        models.add(new Model(CLAUDE, "Claude", anthropic::isConfigured, anthropic::complete, 0.95, 0.45, 0.60));
        models.add(new Model(CHATGPT, "ChatGPT", openai::isConfigured, openai::complete, 0.85, 0.60, 0.70));
        models.add(new Model(GEMINI, "Gemini", gemini::isConfigured, gemini::complete, 0.75, 0.95, 0.90));
    }

    /**
     * Answer one chat turn. Honors a manual model choice when that model is available; otherwise
     * (or for {@code auto}) selects the best model for the turn.
     *
     * @param message   the user's message (may carry the app's directive prefix)
     * @param history   prior turns, oldest first
     * @param requested one of auto/claude/gemini/chatgpt (case-insensitive); null == auto
     * @return the reply text plus the label of the model that actually answered
     */
    public ChatResult chat(String message, List<String> history, String requested) {
        String choice = normalize(requested);
        String summary = summaryClient.fetchSummaryText();
        String system = SystemPrompts.chat(summary);
        String userMessage = buildUserMessage(message, history);

        // Build the ordered list of models to try.
        List<Model> order = plan(choice, message);

        for (Model m : order) {
            try {
                String reply = m.complete.apply(system, userMessage);
                if (reply == null || reply.isBlank()) {
                    continue; // treat empty as a soft miss, try the next model
                }
                lastFailure.remove(m.key); // recovered
                if (!reply.contains(SystemPrompts.DISCLAIMER)) {
                    reply = reply + "\n\n" + SystemPrompts.DISCLAIMER;
                }
                return new ChatResult(reply, m.label);
            } catch (Exception e) {
                lastFailure.put(m.key, System.currentTimeMillis());
                log.warn("Chat via {} failed ({}); trying next model.", m.label, e.getMessage());
            }
        }

        // Everything real is unavailable or failed — deterministic offline reply.
        return new ChatResult(fallback.chat(message, history), "Assistant");
    }

    /** Decide which models to attempt, in priority order, for this turn. */
    private List<Model> plan(String choice, String message) {
        List<Model> candidates = new ArrayList<>();

        // A manual pick goes first if it is configured (even if it is in cooldown — the user
        // explicitly asked for it). The rest follow as graceful fallbacks.
        if (!AUTO.equals(choice)) {
            Model picked = byKey(choice);
            if (picked != null && picked.configured.get()) {
                candidates.add(picked);
            }
        }

        // Rank the remaining configured models best-first. score() already demotes a model that
        // is in its post-failure cooldown, so healthy models naturally sort ahead of unhealthy
        // ones and the latter remain only as last-resort fallbacks.
        double complexity = estimateComplexity(message);
        models.stream()
                .filter(m -> m.configured.get())
                .filter(m -> !candidates.contains(m))
                .sorted((a, b) -> Double.compare(score(b, complexity), score(a, complexity)))
                .forEach(candidates::add);

        return candidates;
    }

    /**
     * Score a model for a turn of the given complexity. Hard asks weight reasoning strength;
     * easy asks weight cost and speed.
     */
    private double score(Model m, double complexity) {
        double efficiency = 0.5 * m.cheapness + 0.5 * m.speed;
        double base = complexity * m.reasoning + (1 - complexity) * efficiency;
        return inCooldown(m.key) ? base - 1.0 : base; // demote unhealthy models
    }

    /** Rough 0..1 complexity estimate from message length and analytical intent. */
    private double estimateComplexity(String message) {
        if (message == null || message.isBlank()) {
            return 0.3;
        }
        String q = message.toLowerCase();
        int len = q.length();
        double lengthScore = Math.min(1.0, len / 400.0);
        String[] hard = {"why", "compare", "strategy", "strategize", "analyze", "analysis", "plan",
                "scenario", "optimi", "forecast", "project", "trade-off", "tradeoff", "should i",
                "explain", "diversif", "refinance", "allocation", "retire", "tax"};
        int hits = 0;
        for (String h : hard) {
            if (q.contains(h)) hits++;
        }
        double intentScore = Math.min(1.0, hits / 3.0);
        return Math.max(0.15, 0.5 * lengthScore + 0.5 * intentScore);
    }

    private boolean inCooldown(String key) {
        Long ts = lastFailure.get(key);
        return ts != null && (System.currentTimeMillis() - ts) < cooldownMs;
    }

    private Model byKey(String key) {
        return models.stream().filter(m -> m.key.equals(key)).findFirst().orElse(null);
    }

    private String normalize(String requested) {
        if (requested == null || requested.isBlank()) return AUTO;
        String r = requested.trim().toLowerCase();
        switch (r) {
            case CLAUDE: case "anthropic": return CLAUDE;
            case GEMINI: case "google": return GEMINI;
            case CHATGPT: case "openai": case "gpt": return CHATGPT;
            default: return AUTO;
        }
    }

    /** Fold prior turns into the message so the single-shot call keeps conversational context. */
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

    /** A single routable model: its key, display label, availability, call, and cost/speed profile. */
    private static final class Model {
        final String key;
        final String label;
        final java.util.function.Supplier<Boolean> configured;
        final java.util.function.BiFunction<String, String, String> complete;
        final double reasoning;
        final double cheapness;
        final double speed;

        Model(String key, String label,
              java.util.function.Supplier<Boolean> configured,
              java.util.function.BiFunction<String, String, String> complete,
              double reasoning, double cheapness, double speed) {
            this.key = key;
            this.label = label;
            this.configured = configured;
            this.complete = complete;
            this.reasoning = reasoning;
            this.cheapness = cheapness;
            this.speed = speed;
        }
    }

    /** Result of a routed chat: the reply text and the label of the model that produced it. */
    public record ChatResult(String reply, String model) {
    }
}
