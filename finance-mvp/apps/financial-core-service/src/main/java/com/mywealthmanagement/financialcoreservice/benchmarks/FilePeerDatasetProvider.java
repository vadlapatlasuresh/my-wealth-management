package com.mywealthmanagement.financialcoreservice.benchmarks;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Peer percentiles loaded from a published, aggregate dataset on disk. Selected with
 * {@code benchmarks.provider=file} plus {@code benchmarks.dataset.path=/path/to/percentiles.json}.
 *
 * <p>A file rather than an API because the datasets that are actually <em>allowed</em> here are
 * published tables, not query services — the Federal Reserve's Survey of Consumer Finances
 * percentile tables being the obvious first candidate: public, genuinely aggregate, and
 * defensible to cite by name in the UI. Mount the file, point the property at it, restart.
 *
 * <p>Expected shape (percentile keys are strings; values are in USD, or a 0..1 rate):
 * <pre>
 * {
 *   "source": "Federal Reserve, Survey of Consumer Finances 2022",
 *   "cohorts": [
 *     { "metric": "netWorth", "ageBand": "35_44", "incomeBand": null, "region": null,
 *       "sampleSize": 1340, "points": { "10": 900, "25": 14500, "50": 91300, "75": 310000, "90": 890000 } }
 *   ]
 * }
 * </pre>
 *
 * <p>Matching is most-specific-first: an exact (age, income, region) cohort wins, then
 * progressively broader ones, and finally the all-cohort row. If nothing matches we return
 * {@link Cohort#unavailable} rather than interpolating something plausible — see
 * {@link UnavailablePeerDatasetProvider} for why that line is drawn hard.
 */
@Component
public class FilePeerDatasetProvider implements PeerDatasetProvider {

    private static final Logger log = LoggerFactory.getLogger(FilePeerDatasetProvider.class);

    private final String path;
    private final ObjectMapper mapper = new ObjectMapper();

    /** cohortKey -> cohort. Loaded lazily on first use, then cached for the process lifetime. */
    private volatile Map<String, Cohort> cohorts;
    private volatile boolean loadAttempted;

    public FilePeerDatasetProvider(@Value("${benchmarks.dataset.path:}") String path) {
        this.path = path == null ? "" : path.trim();
    }

    @Override
    public String name() {
        return "file";
    }

    @Override
    public boolean isConfigured() {
        return !path.isBlank() && Files.isReadable(Path.of(path));
    }

    @Override
    public Cohort percentiles(String metric, String ageBand, String incomeBand, String region) {
        Map<String, Cohort> loaded = load();
        if (loaded.isEmpty()) {
            return Cohort.unavailable("The configured peer dataset could not be read.");
        }
        // Most specific match first, widening one axis at a time.
        String[] candidates = {
                key(metric, ageBand, incomeBand, region),
                key(metric, ageBand, incomeBand, null),
                key(metric, ageBand, null, null),
                key(metric, null, null, null),
        };
        for (String k : candidates) {
            Cohort c = loaded.get(k);
            if (c != null) {
                return c;
            }
        }
        return Cohort.unavailable("The dataset doesn't cover this cohort yet.");
    }

    // ------------------------------------------------------------------ loading

    private Map<String, Cohort> load() {
        if (loadAttempted) {
            return cohorts == null ? Map.of() : cohorts;
        }
        synchronized (this) {
            if (loadAttempted) {
                return cohorts == null ? Map.of() : cohorts;
            }
            loadAttempted = true;
            Map<String, Cohort> out = new LinkedHashMap<>();
            try {
                JsonNode root = mapper.readTree(Files.readString(Path.of(path)));
                String source = root.path("source").asText("Configured peer dataset");
                for (JsonNode c : root.path("cohorts")) {
                    Map<Integer, Double> points = new LinkedHashMap<>();
                    JsonNode pts = c.path("points");
                    pts.fieldNames().forEachRemaining(f -> {
                        try {
                            points.put(Integer.parseInt(f), pts.get(f).asDouble());
                        } catch (NumberFormatException ignored) {
                            // A malformed percentile key is skipped; the completeness check below
                            // then rejects the cohort rather than rendering a partial curve.
                        }
                    });
                    if (!points.keySet().containsAll(Cohort.REQUIRED_PERCENTILES)) {
                        log.warn("Peer dataset cohort missing required percentiles; skipping: {}", c);
                        continue;
                    }
                    out.put(key(c.path("metric").asText(null), text(c, "ageBand"),
                                    text(c, "incomeBand"), text(c, "region")),
                            new Cohort(true, null, source, c.path("sampleSize").asInt(0), points));
                }
                log.info("Loaded {} peer-benchmark cohorts from {}", out.size(), path);
            } catch (Exception e) {
                log.warn("Could not load peer dataset from '{}': {}", path, e.getMessage());
            }
            cohorts = out;
            return out;
        }
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return (v == null || v.isNull() || v.asText().isBlank()) ? null : v.asText();
    }

    private static String key(String metric, String age, String income, String region) {
        return metric + "|" + age + "|" + income + "|" + region;
    }
}
