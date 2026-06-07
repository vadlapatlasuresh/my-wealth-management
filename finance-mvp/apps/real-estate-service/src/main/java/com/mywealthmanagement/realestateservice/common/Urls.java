package com.mywealthmanagement.realestateservice.common;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;

/**
 * Validation helpers for user-supplied URLs. Only {@code http}/{@code https} links are
 * accepted, defeating {@code javascript:}/{@code data:} and other unsafe schemes that
 * would be dangerous when rendered as a clickable link in the UI.
 */
public final class Urls {

    private static final int MAX_LENGTH = 500;

    private Urls() {
    }

    /**
     * @return a normalized URL string, or {@code null} if the input is blank.
     * @throws ResponseStatusException 400 if the value is present but not a safe http(s) URL.
     */
    public static String validateOrNull(String raw, String fieldName) {
        if (raw == null) {
            return null;
        }
        String value = raw.trim();
        if (value.isEmpty()) {
            return null;
        }
        if (value.length() > MAX_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + " is too long");
        }
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        fieldName + " must start with http:// or https://");
            }
            if (uri.getHost() == null || uri.getHost().isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + " must include a domain");
            }
            return value;
        } catch (java.net.URISyntaxException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + " is not a valid URL");
        }
    }
}
