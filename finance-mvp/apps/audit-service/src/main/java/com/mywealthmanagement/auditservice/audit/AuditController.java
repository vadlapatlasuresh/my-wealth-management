package com.mywealthmanagement.auditservice.audit;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/v1/audit")
@RequiredArgsConstructor
public class AuditController {

    private final AuditEventRepository repository;
    private final AuditChainService chainService;

    @Value("${audit.ingest.key:}")
    private String ingestKey;

    // ---- Ingest (internal): the gateway + services post here ----------------
    @PostMapping("/events")
    public ResponseEntity<Void> ingest(@RequestBody AuditEventDto dto,
                                       @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        // Enforce the shared internal key when one is configured.
        if (StringUtils.hasText(ingestKey) && !ingestKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        AuditEvent e = new AuditEvent();
        e.setUserId(dto.getUserId());
        e.setActorType(dto.getActorType() != null ? dto.getActorType()
                : (StringUtils.hasText(dto.getUserId()) ? "USER" : "ANONYMOUS"));
        e.setAction(dto.getAction() != null ? dto.getAction() : "unknown");
        e.setService(dto.getService());
        e.setMethod(dto.getMethod());
        e.setPath(dto.getPath());
        e.setStatus(dto.getStatus());
        e.setSourceIp(dto.getSourceIp());
        e.setUserAgent(truncate(dto.getUserAgent(), 512));
        e.setLatencyMs(dto.getLatencyMs());
        e.setOutcome(dto.getOutcome());
        e.setMetadata(dto.getMetadata());
        chainService.append(e); // hash-chained, tamper-evident insert
        return ResponseEntity.accepted().build();
    }

    // ---- Integrity check (internal): verify the tamper-evident hash chain ----
    @GetMapping("/verify")
    public AuditChainService.ChainStatus verify(
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireInternalKey(key);
        return chainService.verify();
    }

    // ---- The signed-in user's own activity ---------------------------------
    @GetMapping("/me")
    public List<AuditEventDto> myActivity(@RequestParam(defaultValue = "0") int page,
                                          @RequestParam(defaultValue = "50") int size) {
        String userId = SecurityContextHolder.getContext().getAuthentication().getName();
        return repository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(page, clampSize(size)))
                .map(this::toDto).getContent();
    }

    // ---- Back-office query (server-to-server via internal key) --------------
    @GetMapping("/events")
    public Page<AuditEventDto> search(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        requireInternalKey(key);
        return repository.search(emptyToNull(userId), emptyToNull(action), from, to,
                PageRequest.of(page, clampSize(size))).map(this::toDto);
    }

    // ---- A specific user's activity (server-to-server via internal key) -----
    @GetMapping("/users/{userId}")
    public List<AuditEventDto> userActivity(@PathVariable String userId,
                                            @RequestHeader(value = "X-Internal-Key", required = false) String key,
                                            @RequestParam(defaultValue = "0") int page,
                                            @RequestParam(defaultValue = "50") int size) {
        requireInternalKey(key);
        return repository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(page, clampSize(size)))
                .map(this::toDto).getContent();
    }

    private void requireInternalKey(String key) {
        if (StringUtils.hasText(ingestKey) && !ingestKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
    }

    private AuditEventDto toDto(AuditEvent a) {
        return new AuditEventDto(a.getId(), a.getUserId(), a.getActorType(), a.getAction(),
                a.getService(), a.getMethod(), a.getPath(), a.getStatus(), a.getSourceIp(),
                a.getUserAgent(), a.getLatencyMs(), a.getOutcome(), a.getMetadata(), a.getCreatedAt());
    }

    private static String emptyToNull(String s) { return StringUtils.hasText(s) ? s : null; }
    private static int clampSize(int size) { return Math.min(Math.max(size, 1), 500); }
    private static String truncate(String s, int max) { return s == null || s.length() <= max ? s : s.substring(0, max); }
}
