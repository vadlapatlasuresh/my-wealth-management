package com.mywealthmanagement.aiinsightsservice.controller;

import com.mywealthmanagement.aiinsightsservice.dto.ChatRequest;
import com.mywealthmanagement.aiinsightsservice.dto.ChatResponse;
import com.mywealthmanagement.aiinsightsservice.dto.InsightDto;
import com.mywealthmanagement.aiinsightsservice.entity.Insight;
import com.mywealthmanagement.aiinsightsservice.provider.AiProvider;
import com.mywealthmanagement.aiinsightsservice.provider.GeneratedInsight;
import com.mywealthmanagement.aiinsightsservice.repository.InsightRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
public class AiController {

    private final InsightRepository insightRepository;
    private final AiProvider aiProvider;

    @GetMapping("/insights")
    public List<InsightDto> getInsights() {
        Long userId = currentUserId();
        List<Insight> stored = insightRepository.findByUserIdOrderByCreatedAtDesc(userId);
        if (stored.isEmpty()) {
            stored = generateAndPersist(userId);
        }
        return stored.stream().map(this::toDto).collect(Collectors.toList());
    }

    @PostMapping("/insights/refresh")
    @Transactional
    public List<InsightDto> refreshInsights() {
        Long userId = currentUserId();
        insightRepository.deleteByUserId(userId);
        List<Insight> regenerated = generateAndPersist(userId);
        return regenerated.stream().map(this::toDto).collect(Collectors.toList());
    }

    @PostMapping("/chat")
    public ChatResponse chat(@Valid @RequestBody ChatRequest request) {
        // userId is available for future personalization of the chat reply.
        currentUserId();
        String reply = aiProvider.chat(request.getMessage(), request.getHistory());
        return new ChatResponse(reply);
    }

    private List<Insight> generateAndPersist(Long userId) {
        List<GeneratedInsight> generated = aiProvider.generateInsights(userId);
        List<Insight> toSave = generated.stream()
                .map(g -> Insight.builder()
                        .userId(userId)
                        .title(g.getTitle())
                        .reason(g.getReason())
                        .severity(g.getSeverity())
                        .suggestedAction(g.getSuggestedAction())
                        .build())
                .collect(Collectors.toList());
        insightRepository.saveAll(toSave);
        return insightRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    private InsightDto toDto(Insight insight) {
        return InsightDto.builder()
                .id(insight.getId())
                .title(insight.getTitle())
                .reason(insight.getReason())
                .severity(insight.getSeverity())
                .suggestedAction(insight.getSuggestedAction())
                .createdAt(insight.getCreatedAt())
                .build();
    }

    private Long currentUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
