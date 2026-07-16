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
    private final AuditCheckpointService checkpointService;
    private final AuditStatsService statsService;
    private final com.mywealthmanagement.auditservice.geo.GeoIpService geoIpService;

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
        // Actor/target + semantics. actorKind/actorId default from the legacy fields so a caller
        // that hasn't been updated still produces coherent rows rather than null actors.
        e.setActorKind(dto.getActorKind() != null ? dto.getActorKind() : defaultActorKind(dto));
        e.setActorId(dto.getActorId() != null ? dto.getActorId() : dto.getUserId());
        e.setTargetUserId(dto.getTargetUserId());
        e.setReason(dto.getReason());
        e.setBeforeJson(dto.getBeforeJson());
        e.setAfterJson(dto.getAfterJson());
        e.setTicketRef(truncate(dto.getTicketRef(), 64));
        // Enrich with offline geo-IP (no-op / null when GeoIP is disabled or unresolved).
        var geo = geoIpService.resolve(dto.getSourceIp());
        if (geo != null) {
            e.setGeoCity(truncate(geo.city(), 128));
            e.setGeoCountry(truncate(geo.country(), 128));
        }
        chainService.append(e); // hash-chained, tamper-evident insert
        return ResponseEntity.accepted().build();
    }

    // ---- Integrity check (internal): verify the tamper-evident hash chain ----
    @GetMapping("/verify")
    public java.util.Map<String, Object> verify(
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireInternalKey(key);
        AuditChainService.ChainStatus chain = chainService.verify();
        AuditCheckpointService.CheckpointStatus checkpoints = checkpointService.verifyCheckpoints();

        // Both must hold. The chain alone proves nobody edited a row WITHOUT the key; the
        // checkpoints prove nobody rewrote history WITH it. Reporting them separately means a
        // failure says which of those two happened.
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("valid", chain.valid() && checkpoints.valid());
        m.put("chain", chain);
        m.put("checkpoints", checkpoints);
        return m;
    }

    /** Force a checkpoint now (internal). The scheduled job does this daily. */
    @PostMapping("/checkpoints")
    public AuditCheckpoint createCheckpoint(
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        requireInternalKey(key);
        return checkpointService.createCheckpoint();
    }

    // ---- Operator KPI stats (ADMIN/CARE via JWT role) -----------------------
    @GetMapping("/stats")
    public java.util.Map<String, Object> stats(@RequestParam(defaultValue = "30") int days) {
        return statsService.stats(days);
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

    /**
     * Everything ever done TO this customer, by anyone — the access record for one person.
     *
     * This is the endpoint the old schema could not support: `user_id` was the actor, so the only
     * way to ask "who looked at customer 42" was to pattern-match URL paths and hope. Now it's an
     * index hit on target_user_id.
     *
     * Server-to-server (internal key); auth-service fronts it for the ops portal behind the
     * audit.query permission.
     */
    @GetMapping("/target/{targetUserId}")
    public List<AuditEventDto> targetHistory(@PathVariable String targetUserId,
                                             @RequestHeader(value = "X-Internal-Key", required = false) String key,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(defaultValue = "100") int size) {
        requireInternalKey(key);
        return repository.findByTargetUserIdOrderByCreatedAtDesc(targetUserId,
                PageRequest.of(page, clampSize(size))).map(this::toDto).getContent();
    }

    /**
     * Everything a given ops user did, across all customers — the per-agent review, and the
     * counterpart to /target/{id}. `distinctTargets` is the cheap signal for the access-review
     * question that actually matters: is this agent touching far more customers than their peers?
     */
    @GetMapping("/actor/{actorId}")
    public java.util.Map<String, Object> actorHistory(@PathVariable String actorId,
                                                      @RequestHeader(value = "X-Internal-Key", required = false) String key,
                                                      @RequestParam(defaultValue = "30") int days,
                                                      @RequestParam(defaultValue = "0") int page,
                                                      @RequestParam(defaultValue = "100") int size) {
        requireInternalKey(key);
        LocalDateTime from = LocalDateTime.now().minusDays(Math.max(days, 1));
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("events", repository.findByActorIdOrderByCreatedAtDesc(actorId,
                PageRequest.of(page, clampSize(size))).map(this::toDto).getContent());
        m.put("distinctTargets", repository.countDistinctTargetsByActorSince(actorId, from));
        m.put("windowDays", days);
        return m;
    }

    private void requireInternalKey(String key) {
        if (StringUtils.hasText(ingestKey) && !ingestKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
    }

    /** MEMBER unless told otherwise — an ops caller must say so explicitly via actorKind/actorType. */
    private static String defaultActorKind(AuditEventDto dto) {
        if ("OPS".equals(dto.getActorType())) return "OPS";
        if ("SYSTEM".equals(dto.getActorType())) return "SYSTEM";
        return StringUtils.hasText(dto.getUserId()) ? "MEMBER" : "ANONYMOUS";
    }

    private AuditEventDto toDto(AuditEvent a) {
        return new AuditEventDto(a.getId(), a.getUserId(), a.getActorType(), a.getAction(),
                a.getService(), a.getMethod(), a.getPath(), a.getStatus(), a.getSourceIp(),
                a.getUserAgent(), a.getLatencyMs(), a.getOutcome(), a.getMetadata(), a.getCreatedAt(),
                a.getGeoCity(), a.getGeoCountry(),
                a.getActorKind(), a.getActorId(), a.getTargetUserId(), a.getReason(),
                a.getBeforeJson(), a.getAfterJson(), a.getTicketRef(), a.getHashVersion());
    }

    private static String emptyToNull(String s) { return StringUtils.hasText(s) ? s : null; }
    private static int clampSize(int size) { return Math.min(Math.max(size, 1), 500); }
    private static String truncate(String s, int max) { return s == null || s.length() <= max ? s : s.substring(0, max); }
}
