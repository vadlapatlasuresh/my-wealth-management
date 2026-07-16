package com.mywealthmanagement.authservice.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Consistent API error envelope {timestamp,status,error,message[,fields]} so clients
 * get clean, typed errors instead of stack traces. Pairs with the SecurityConfig
 * /error permitAll so 500s are never masked as 403.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static Map<String, Object> body(HttpStatus s, String msg) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("timestamp", LocalDateTime.now().toString());
        m.put("status", s.value());
        m.put("error", s.getReasonPhrase());
        m.put("message", msg);
        return m;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, Object> b = body(HttpStatus.BAD_REQUEST, "Validation failed");
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fields.put(fe.getField(), fe.getDefaultMessage());
        }
        b.put("fields", fields);
        return ResponseEntity.badRequest().body(b);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArg(IllegalArgumentException ex) {
        HttpStatus s = ex.getMessage() != null && ex.getMessage().toLowerCase().contains("not found")
                ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(s).body(body(s, ex.getMessage() != null ? ex.getMessage() : "Bad request"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleRSE(ResponseStatusException ex) {
        HttpStatus s = HttpStatus.valueOf(ex.getStatusCode().value());
        return ResponseEntity.status(s).body(body(s, ex.getReason() != null ? ex.getReason() : s.getReasonPhrase()));
    }

    @ExceptionHandler({
            org.springframework.http.converter.HttpMessageNotReadableException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<Map<String, Object>> handleBadRequest(Exception ex) {
        return ResponseEntity.badRequest().body(body(HttpStatus.BAD_REQUEST,
                "Malformed or invalid request body or parameter"));
    }

    @ExceptionHandler(jakarta.validation.ConstraintViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConstraint(jakarta.validation.ConstraintViolationException ex) {
        return ResponseEntity.badRequest().body(body(HttpStatus.BAD_REQUEST, ex.getMessage()));
    }

    /**
     * A denied @PreAuthorize check is a 403, not a 500.
     *
     * Without this, the catch-all below swallows Spring Security's AuthorizationDeniedException
     * and every permission denial surfaces as "500 Internal Server Error: Access Denied" — which
     * reads as a broken server, hides a working control, and would have clients retrying a
     * decision that will never change. The method-security exceptions bypass the filter chain's
     * normal 403 handling precisely because they're thrown from inside the controller layer,
     * which is where this advice lives.
     */
    // AuthorizationDeniedException (what @PreAuthorize throws) extends AccessDeniedException, so
    // the parent covers both.
    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(Exception ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(body(HttpStatus.FORBIDDEN, "You do not have permission to perform this action"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(body(HttpStatus.INTERNAL_SERVER_ERROR,
                        ex.getMessage() != null ? ex.getMessage() : "Internal server error"));
    }
}
