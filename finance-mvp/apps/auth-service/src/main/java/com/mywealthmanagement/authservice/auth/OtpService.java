package com.mywealthmanagement.authservice.auth;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory SMS one-time-passcode service used for phone confirmation at signup.
 *
 * This is a mock provider: it generates a 6-digit code and "sends" it by returning
 * it to the caller (dev convenience). In production, replace {@link #generate} with a
 * Twilio/SNS send and DO NOT return the code in the API response.
 */
@Service
public class OtpService {

    private static final long TTL_SECONDS = 300; // 5 minutes
    private static final SecureRandom RANDOM = new SecureRandom();

    private record Entry(String code, Instant expiresAt) {}

    private final Map<String, Entry> store = new ConcurrentHashMap<>();

    /** Generate + store a code for the given phone; returns the code (dev only). */
    public String generate(String phone) {
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        store.put(normalize(phone), new Entry(code, Instant.now().plusSeconds(TTL_SECONDS)));
        return code;
    }

    /** Verify a submitted code; consumes it on success. */
    public boolean verify(String phone, String code) {
        if (phone == null || code == null) return false;
        Entry e = store.get(normalize(phone));
        if (e == null) return false;
        if (Instant.now().isAfter(e.expiresAt())) {
            store.remove(normalize(phone));
            return false;
        }
        boolean ok = e.code().equals(code.trim());
        if (ok) store.remove(normalize(phone));
        return ok;
    }

    private static String normalize(String phone) {
        return phone == null ? "" : phone.replaceAll("\\D", "");
    }
}
