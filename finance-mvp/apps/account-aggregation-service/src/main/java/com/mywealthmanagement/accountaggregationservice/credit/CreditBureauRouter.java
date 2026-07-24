package com.mywealthmanagement.accountaggregationservice.credit;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Selects the active {@link CreditBureauProvider} from config and guarantees a usable answer.
 *
 * <p>Same shape as notification-service's {@code ChannelRouter}: providers are auto-discovered
 * beans, the active one is named by a property, and adding a bureau needs no change here.
 *
 * <pre>
 *   credit.provider=demo   (default) → deterministic demo profile, clearly labeled
 *   credit.provider=http             → the real bureau (HttpCreditBureauProvider)
 * </pre>
 *
 * <p><b>Fallback policy — fail-open to DEMO, never to a fabricated "live".</b> If the configured
 * provider is unknown, unconfigured, or throws, we serve the demo profile with
 * {@code provider="demo"} so the client keeps its Demo banner. That means a bureau outage
 * degrades the screen's honesty label, not the app. The one thing we never do is present demo
 * numbers as a real score.
 */
@Component
public class CreditBureauRouter {

    private static final Logger log = LoggerFactory.getLogger(CreditBureauRouter.class);

    private final List<CreditBureauProvider> providers;
    private final DemoCreditBureauProvider demo;
    private final String wanted;

    private CreditBureauProvider active;

    public CreditBureauRouter(List<CreditBureauProvider> providers,
                              DemoCreditBureauProvider demo,
                              @Value("${credit.provider:demo}") String wanted) {
        this.providers = providers;
        this.demo = demo;
        this.wanted = (wanted == null || wanted.isBlank()) ? DemoCreditBureauProvider.NAME : wanted.trim();
    }

    @PostConstruct
    void resolveActiveProvider() {
        // "mock" is accepted as an alias for "demo" so the property reads the same way as
        // comms.provider.* in notification-service.
        String key = "mock".equalsIgnoreCase(wanted) ? DemoCreditBureauProvider.NAME : wanted;

        CreditBureauProvider chosen = providers.stream()
                .filter(p -> p.name().equalsIgnoreCase(key))
                .findFirst()
                .orElse(null);

        if (chosen == null) {
            log.warn("[CreditBureauRouter] Unknown credit.provider='{}'; using '{}'", wanted, demo.name());
            chosen = demo;
        } else if (!chosen.isConfigured()) {
            log.warn("[CreditBureauRouter] Provider '{}' is selected but not configured "
                    + "(missing credentials/base-url); serving the demo profile instead.", chosen.name());
            chosen = demo;
        }
        active = chosen;
        log.info("[CreditBureauRouter] credit profile -> provider '{}' ({})",
                active.name(), active.getClass().getSimpleName());
    }

    /** Name of the provider actually in use (after config resolution). */
    public String activeProviderName() {
        return active == null ? demo.name() : active.name();
    }

    /** True when a real bureau is wired and answering; drives the client's "Demo" banner. */
    public boolean isLive() {
        return active != null && active != demo;
    }

    /**
     * The caller's credit profile. Falls back to the demo profile if the live provider fails,
     * so this method does not throw for provider-side problems.
     */
    public Map<String, Object> profileFor(long userId) {
        CreditBureauProvider p = active == null ? demo : active;
        if (p == demo) {
            return demo.fetchProfile(userId);
        }
        try {
            Map<String, Object> profile = p.fetchProfile(userId);
            if (profile != null && profile.get("score") != null) {
                return profile;
            }
            log.warn("[CreditBureauRouter] Provider '{}' returned no score; falling back to demo.", p.name());
        } catch (Exception e) {
            log.warn("[CreditBureauRouter] Provider '{}' failed ({}); falling back to demo.",
                    p.name(), e.getMessage());
        }
        return demo.fetchProfile(userId);
    }
}
