package com.mywealthmanagement.notificationservice.comms;

import com.mywealthmanagement.notificationservice.comms.dto.DeliveryResultDto;
import com.mywealthmanagement.notificationservice.comms.dto.SendRequest;
import com.mywealthmanagement.notificationservice.comms.dto.TemplateDto;
import com.mywealthmanagement.notificationservice.comms.template.MessageTemplate;
import com.mywealthmanagement.notificationservice.comms.template.MessageTemplateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Endpoints for the generic comms layer. Lives alongside the existing
 * NotificationController; all existing routes are untouched. Same base path,
 * same auth (JWT principal = userId).
 */
@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class CommsController {

    private final MessageTemplateRepository templateRepository;
    private final NotificationOrchestrator orchestrator;

    private Long currentUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    @GetMapping("/templates")
    public ResponseEntity<Map<String, List<TemplateDto>>> listTemplates() {
        List<TemplateDto> items = templateRepository.findAll().stream()
                .map(this::toDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("items", items));
    }

    @PostMapping("/send")
    public ResponseEntity<Map<String, List<DeliveryResultDto>>> send(@RequestBody SendRequest body) {
        Long userId = currentUserId();

        if (body.getTemplateKey() == null || body.getTemplateKey().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "templateKey is required");
        }

        List<Channel> channels = body.getChannels() == null ? null : body.getChannels().stream()
                .map(this::parseChannel)
                .collect(Collectors.toList());

        List<DeliveryResult> results = orchestrator.dispatch(
                userId,
                body.getTemplateKey(),
                channels,
                body.getVars(),
                body.getLocale(),
                body.getIdempotencyKey());

        List<DeliveryResultDto> dtos = results.stream()
                .map(r -> new DeliveryResultDto(
                        r.getChannel().name(),
                        r.getStatus().name(),
                        r.getProviderRef(),
                        r.getMessage()))
                .collect(Collectors.toList());

        return ResponseEntity.ok(Map.of("results", dtos));
    }

    private Channel parseChannel(String raw) {
        try {
            return Channel.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown channel: " + raw);
        }
    }

    private TemplateDto toDto(MessageTemplate t) {
        return new TemplateDto(
                t.getId(),
                t.getTemplateKey(),
                t.getChannel().name(),
                t.getLocale(),
                t.getSubject(),
                t.getBody(),
                t.getVariables(),
                t.getVersion(),
                t.isEnabled());
    }
}
