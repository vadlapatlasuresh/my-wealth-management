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
 * Returns the stub/demo profile from CreditService — see that class for the provider-toggle.
 */
@RestController
@RequestMapping("/api/v1/aggregation/credit")
@RequiredArgsConstructor
public class CreditController {

    private final CreditService creditService;

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> me() {
        return ResponseEntity.ok(creditService.profileFor(currentUserId()));
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
