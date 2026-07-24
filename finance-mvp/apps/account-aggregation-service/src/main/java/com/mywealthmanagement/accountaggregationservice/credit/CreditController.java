package com.mywealthmanagement.accountaggregationservice.credit;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Credit monitoring endpoint (Phase 4). Hosted under /api/v1/aggregation/** so it reuses the
 * existing gateway route (no RouteLocator change needed). Authenticated like every other
 * aggregation route (SecurityConfig: anyRequest().authenticated()); the caller is the subject.
 *
 * <p>The profile comes from {@link CreditBureauRouter}, which serves either a contracted bureau
 * ({@code credit.provider=http}) or the deterministic demo profile ({@code credit.provider=demo},
 * the default) and falls back to demo on any provider failure. The {@code provider} field in the
 * response tells the client which it got, so the UI's "Demo" banner is always truthful.
 */
@RestController
@RequestMapping("/api/v1/aggregation/credit")
@RequiredArgsConstructor
public class CreditController {

    private final CreditBureauRouter bureau;

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me() {
        return ResponseEntity.ok(bureau.profileFor(currentUserId()));
    }

    /**
     * Which provider is wired, without exposing any of the user's credit data. The client reads
     * this to decide whether to offer the feature as real monitoring or as a labeled preview.
     */
    @GetMapping("/provider")
    public ResponseEntity<Map<String, Object>> provider() {
        return ResponseEntity.ok(Map.of(
                "provider", bureau.activeProviderName(),
                "live", bureau.isLive()));
    }

    private long currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        try {
            return Long.parseLong(auth.getName());
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Invalid session. Please sign out and sign in again.");
        }
    }
}
