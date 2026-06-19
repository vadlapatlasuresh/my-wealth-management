package com.mywealthmanagement.authservice.auth;

import com.mywealthmanagement.authservice.auth.dto.AuthResponse;
import com.mywealthmanagement.authservice.user.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Social (OAuth/OIDC) sign-in. The browser obtains an ID token from the provider
 * (Google Identity Services / Sign in with Apple), POSTs it here; we verify it,
 * find-or-create the local user, and return our own JWT — identical shape to the
 * password login response, so the web app's onAuthenticated handler is reused.
 *
 * Fully scaffolded but INERT until the provider client ids are configured
 * (oauth.google.client-id / oauth.apple.client-id). Until then /config reports the
 * provider as disabled (so the web hides the button) and the endpoint returns 503.
 */
@RestController
@RequestMapping("/api/v1/auth/oauth")
public class OAuthController {

    private final AuthService authService;
    private final GoogleTokenVerifier google;
    private final String appleClientId;

    public OAuthController(AuthService authService,
                           GoogleTokenVerifier google,
                           @Value("${oauth.apple.client-id:}") String appleClientId) {
        this.authService = authService;
        this.google = google;
        this.appleClientId = appleClientId;
    }

    /**
     * Which social providers are configured + their PUBLIC client ids (the browser
     * needs the Google id to initialize Google Identity Services). Empty string =
     * disabled, so the web hides that button. No secrets are exposed here.
     */
    @GetMapping("/config")
    public Map<String, Object> config() {
        return Map.of(
                "google", google.isConfigured(),
                "googleClientId", google.clientId(),
                "apple", StringUtils.hasText(appleClientId),
                "appleClientId", appleClientId == null ? "" : appleClientId);
    }

    @PostMapping("/google")
    public ResponseEntity<AuthResponse> google(@RequestBody Map<String, String> body) {
        if (!google.isConfigured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(new AuthResponse(null, "Google sign-in is not configured."));
        }
        OidcUser id = google.verify(body.get("idToken"));
        if (id == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new AuthResponse(null, "Could not verify your Google sign-in."));
        }
        User user = authService.findOrCreateOAuthUser(id.email(), id.name(), "google");
        String token = authService.issueToken(user);
        return ResponseEntity.ok(new AuthResponse(token, "Login successful", user.getEmail(), user.getName()));
    }

    @PostMapping("/apple")
    public ResponseEntity<AuthResponse> apple(@RequestBody Map<String, String> body) {
        // Apple verification (JWKS signature check against appleid.apple.com/auth/keys)
        // lands when APPLE keys are provided; until then this is a configured-gated stub.
        if (!StringUtils.hasText(appleClientId)) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(new AuthResponse(null, "Apple sign-in is not configured."));
        }
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
                .body(new AuthResponse(null, "Apple sign-in is being finalized."));
    }
}
