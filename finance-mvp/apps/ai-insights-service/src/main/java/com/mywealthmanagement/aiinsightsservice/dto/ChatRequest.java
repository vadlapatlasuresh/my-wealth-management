package com.mywealthmanagement.aiinsightsservice.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatRequest {

    @NotBlank(message = "message must not be blank")
    private String message;

    private List<String> history;

    /**
     * Preferred AI model for this turn: {@code auto} (default), {@code claude}, {@code gemini},
     * or {@code chatgpt}. Auto Mode picks the best available model; a manual choice is honored
     * when that model is configured. Unknown values fall back to auto.
     */
    private String model;
}
