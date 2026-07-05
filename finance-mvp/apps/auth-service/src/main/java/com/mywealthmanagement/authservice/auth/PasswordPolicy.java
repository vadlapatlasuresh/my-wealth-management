package com.mywealthmanagement.authservice.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Central, configurable password-strength policy. The same rules are mirrored in the
 * web UI (SecurityPage) so the checklist the user sees matches what the server enforces.
 * Every threshold is overridable via config (e.g. PASSWORD_MIN_LENGTH) so the policy can
 * be tightened/loosened without code changes.
 */
@Component
public class PasswordPolicy {

    @Value("${password.min-length:12}")
    private int minLength;

    @Value("${password.require-uppercase:true}")
    private boolean requireUppercase;

    @Value("${password.require-lowercase:true}")
    private boolean requireLowercase;

    @Value("${password.require-digit:true}")
    private boolean requireDigit;

    @Value("${password.require-symbol:true}")
    private boolean requireSymbol;

    @Value("${password.forbid-whitespace:true}")
    private boolean forbidWhitespace;

    /** @return a list of unmet-requirement messages; empty when the password is acceptable. */
    public List<String> violations(String pw) {
        List<String> problems = new ArrayList<>();
        String p = pw == null ? "" : pw;
        if (p.length() < minLength) problems.add("At least " + minLength + " characters");
        if (requireUppercase && !p.chars().anyMatch(Character::isUpperCase)) problems.add("An uppercase letter (A–Z)");
        if (requireLowercase && !p.chars().anyMatch(Character::isLowerCase)) problems.add("A lowercase letter (a–z)");
        if (requireDigit && !p.chars().anyMatch(Character::isDigit)) problems.add("A number (0–9)");
        if (requireSymbol && p.chars().allMatch(c -> Character.isLetterOrDigit(c) || Character.isWhitespace(c)))
            problems.add("A special character (!@#$%…)");
        if (forbidWhitespace && p.chars().anyMatch(Character::isWhitespace)) problems.add("No spaces");
        return problems;
    }

    public boolean isValid(String pw) {
        return violations(pw).isEmpty();
    }

    public int getMinLength() {
        return minLength;
    }

    /** The policy as a flat map, for the client to build a matching requirements checklist. */
    public java.util.Map<String, Object> describe() {
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("minLength", minLength);
        m.put("requireUppercase", requireUppercase);
        m.put("requireLowercase", requireLowercase);
        m.put("requireDigit", requireDigit);
        m.put("requireSymbol", requireSymbol);
        m.put("forbidWhitespace", forbidWhitespace);
        return m;
    }
}
