package com.mywealthmanagement.auditservice.config;

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

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(body(HttpStatus.INTERNAL_SERVER_ERROR,
                        ex.getMessage() != null ? ex.getMessage() : "Internal server error"));
    }
}
