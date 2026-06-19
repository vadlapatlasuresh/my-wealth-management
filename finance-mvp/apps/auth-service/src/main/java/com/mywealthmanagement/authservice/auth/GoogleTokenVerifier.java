package com.mywealthmanagement.authservice.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Verifies a Google ID token (from Google Identity Services on the web) by calling
 * Google's tokeninfo endpoint and checking the audience matches our configured
 * OAuth client id and the email is verified.
 *
 * Scaffolded but inert until {@code oauth.google.client-id} is set — until then
 * {@link #isConfigured()} is false and the controller short-circuits with 503.
 */
@Component
public class GoogleTokenVerifier {

    private static final Logger log = LoggerFactory.getLogger(GoogleTokenVerifier.class);
    private static final String TOKENINFO = "https://oauth2.googleapis.com/tokeninfo";

    private final RestClient http = RestClient.create();
    private final String clientId;

    public GoogleTokenVerifier(@Value("${oauth.google.client-id:}") String clientId) {
        this.clientId = clientId;
    }

    public boolean isConfigured() {
        return StringUtils.hasText(clientId);
    }

    /** The public OAuth client id (safe to expose; the browser needs it for GIS). */
    public String clientId() {
        return clientId == null ? "" : clientId;
    }

    /** Returns the verified user, or null if the token is missing/invalid/untrusted. */
    public OidcUser verify(String idToken) {
        if (!isConfigured() || !StringUtils.hasText(idToken)) return null;
        try {
            Map<?, ?> info = http.get()
                    .uri(TOKENINFO + "?id_token={t}", idToken)
                    .retrieve()
                    .body(Map.class);
            if (info == null) return null;

            // Audience MUST match our client id, and Google must have verified the email.
            if (!clientId.equals(str(info.get("aud")))) {
                log.warn("google oauth: audience mismatch");
                return null;
            }
            if (!"true".equalsIgnoreCase(str(info.get("email_verified")))) return null;

            String email = str(info.get("email"));
            if (!StringUtils.hasText(email)) return null;
            return new OidcUser(email.toLowerCase(), str(info.get("name")));
        } catch (Exception e) {
            log.warn("google oauth: token verification failed: {}", e.getMessage());
            return null;
        }
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
