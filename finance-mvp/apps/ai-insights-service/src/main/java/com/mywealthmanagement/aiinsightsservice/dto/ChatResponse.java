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

    public ChatResponse(String reply) {
        this.reply = reply;
    }
}
