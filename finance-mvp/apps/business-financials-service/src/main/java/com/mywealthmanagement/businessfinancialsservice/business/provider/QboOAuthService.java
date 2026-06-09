package com.mywealthmanagement.businessfinancialsservice.business.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.mywealthmanagement.businessfinancialsservice.business.QboConnection;
import com.mywealthmanagement.businessfinancialsservice.business.QboConnectionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;

/**
 * Handles the QuickBooks Online OAuth2 authorization-code flow: building the
 * Intuit consent URL, exchanging the returned code for tokens, and refreshing
 * an expired access token. Tokens are persisted on the user's
 * {@link QboConnection}. Only used when {@code business.provider=quickbooks};
 * in mock mode nothing here is exercised.
 */
@Service
public class QboOAuthService {

    private static final Logger log = LoggerFactory.getLogger(QboOAuthService.class);
    private static final String SCOPE = "com.intuit.quickbooks.accounting";

    private final QboConnectionRepository connectionRepository;
    private final RestClient tokenClient;
    private final String authorizeBaseUrl;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;

    public QboOAuthService(
            QboConnectionRepository connectionRepository,
            @Value("${qbo.authorize-url:https://appcenter.intuit.com/connect/oauth2}") String authorizeBaseUrl,
            @Value("${qbo.token-url:https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer}") String tokenUrl,
            @Value("${qbo.client-id:}") String clientId,
            @Value("${qbo.client-secret:}") String clientSecret,
            @Value("${qbo.redirect-uri:http://localhost:8085/api/v1/business/oauth/callback}") String redirectUri) {
        this.connectionRepository = connectionRepository;
        this.tokenClient = RestClient.builder().baseUrl(tokenUrl).build();
        this.authorizeBaseUrl = authorizeBaseUrl;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank()
                && clientSecret != null && !clientSecret.isBlank();
    }

    /** Builds the Intuit consent URL; {@code state} carries the userId so the callback can attribute tokens. */
    public String buildAuthorizationUrl(Long userId) {
        return UriComponentsBuilder.fromHttpUrl(authorizeBaseUrl)
                .queryParam("client_id", clientId)
                .queryParam("response_type", "code")
                .queryParam("scope", SCOPE)
                .queryParam("redirect_uri", redirectUri)
                .queryParam("state", String.valueOf(userId))
                .toUriString();
    }

    /** Exchanges an authorization code for tokens and stores them on the connection. */
    public void exchangeCode(Long userId, String code, String realmId) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("code", code);
        form.add("redirect_uri", redirectUri);
        JsonNode tokens = postToken(form);
        QboConnection connection = connectionRepository.findByUserId(userId)
                .orElseGet(() -> new QboConnection(userId));
        applyTokens(connection, tokens);
        connection.setRealmId(realmId);
        connection.setConnected(true);
        if (connection.getCompanyName() == null) {
            connection.setCompanyName("QuickBooks Company");
        }
        connectionRepository.save(connection);
        log.info("QBO connected for user {} (realm {})", userId, realmId);
    }

    /**
     * Returns a valid (refreshing if needed) access token for the connection, or
     * null if the connection has no tokens / refresh fails.
     */
    public String validAccessToken(QboConnection connection) {
        if (connection == null || connection.getRefreshToken() == null) {
            return null;
        }
        boolean expired = connection.getTokenExpiresAt() == null
                || connection.getTokenExpiresAt().isBefore(LocalDateTime.now().plusMinutes(2));
        if (!expired && connection.getAccessToken() != null) {
            return connection.getAccessToken();
        }
        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("grant_type", "refresh_token");
            form.add("refresh_token", connection.getRefreshToken());
            JsonNode tokens = postToken(form);
            applyTokens(connection, tokens);
            connectionRepository.save(connection);
            return connection.getAccessToken();
        } catch (Exception e) {
            log.warn("QBO token refresh failed for user {} ({})", connection.getUserId(), e.getMessage());
            return null;
        }
    }

    private void applyTokens(QboConnection connection, JsonNode tokens) {
        if (tokens == null || !tokens.hasNonNull("access_token")) {
            throw new IllegalStateException("QBO token response missing access_token");
        }
        connection.setAccessToken(tokens.get("access_token").asText());
        if (tokens.hasNonNull("refresh_token")) {
            connection.setRefreshToken(tokens.get("refresh_token").asText());
        }
        long expiresIn = tokens.hasNonNull("expires_in") ? tokens.get("expires_in").asLong() : 3600L;
        connection.setTokenExpiresAt(LocalDateTime.now().plusSeconds(expiresIn));
    }

    private JsonNode postToken(MultiValueMap<String, String> form) {
        String basic = Base64.getEncoder().encodeToString(
                (clientId + ":" + clientSecret).getBytes(StandardCharsets.UTF_8));
        return tokenClient.post()
                .header(HttpHeaders.AUTHORIZATION, "Basic " + basic)
                .header(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(JsonNode.class);
    }
}
