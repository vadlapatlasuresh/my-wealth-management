package com.mywealthmanagement.aiinsightsservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatResponse {
    private String reply;

    /** Label of the model that actually produced the reply (e.g. Claude, Gemini, ChatGPT). */
    private String model;

    /**
     * Whether this turn was answered with PRIORITY routing (Premium — individual.priorityAi).
     * Reported so the UI can be honest: the assistant shows the badge only when the turn really
     * was prioritized, not merely because the user holds the plan. If payment-service was
     * unreachable the turn falls back to standard routing, and this says so.
     */
    private boolean priority;

    public ChatResponse(String reply) {
        this.reply = reply;
    }

    public ChatResponse(String reply, String model) {
        this.reply = reply;
        this.model = model;
    }
}
