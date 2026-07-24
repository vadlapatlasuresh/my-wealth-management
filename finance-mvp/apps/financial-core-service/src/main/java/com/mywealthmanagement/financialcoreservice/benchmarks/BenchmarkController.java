package com.mywealthmanagement.financialcoreservice.benchmarks;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Benchmarking endpoints (Phase 4, backlog B1).
 *
 * <pre>
 *   GET    /api/v1/me/benchmarks          consent state + cohort + peer percentiles (if any)
 *   POST   /api/v1/me/benchmarks/opt-in   { ageBand?, incomeBand?, region? }
 *   DELETE /api/v1/me/benchmarks/opt-in   revoke
 * </pre>
 *
 * Hosted under the existing /api/v1/me/** gateway route, so no RouteLocator change is needed.
 * The response never contains another user's data in any form — only aggregate percentile
 * curves that already passed the k-anonymity floor in {@link BenchmarkService}.
 */
@RestController
@RequestMapping("/api/v1/me/benchmarks")
@RequiredArgsConstructor
public class BenchmarkController {

    private final BenchmarkService benchmarks;

    @GetMapping
    public ResponseEntity<Map<String, Object>> get() {
        return ResponseEntity.ok(benchmarks.benchmarksFor(userId()));
    }

    @PostMapping("/opt-in")
    public ResponseEntity<Map<String, Object>> optIn(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        benchmarks.optIn(userId(), str(b, "ageBand"), str(b, "incomeBand"), str(b, "region"));
        return ResponseEntity.ok(benchmarks.benchmarksFor(userId()));
    }

    @DeleteMapping("/opt-in")
    public ResponseEntity<Map<String, Object>> optOut() {
        benchmarks.optOut(userId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("optedIn", false);
        out.put("available", false);
        return ResponseEntity.ok(out);
    }

    private static String str(Map<String, Object> body, String key) {
        Object v = body.get(key);
        return v == null ? null : String.valueOf(v);
    }

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
