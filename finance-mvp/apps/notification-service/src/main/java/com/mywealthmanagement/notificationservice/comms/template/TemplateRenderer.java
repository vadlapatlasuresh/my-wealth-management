package com.mywealthmanagement.notificationservice.comms.template;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Minimal {@code {{var}}} template renderer. Unknown variables are left as-is.
 */
@Component
public class TemplateRenderer {

    private static final Pattern VAR = Pattern.compile("\\{\\{\\s*([a-zA-Z0-9_.]+)\\s*}}");

    public String render(String template, Map<String, Object> vars) {
        if (template == null) {
            return null;
        }
        Map<String, Object> safe = vars == null ? Map.of() : vars;
        Matcher m = VAR.matcher(template);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String key = m.group(1);
            Object value = safe.get(key);
            String replacement = value != null ? String.valueOf(value) : m.group(0);
            m.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        m.appendTail(out);
        return out.toString();
    }
}
