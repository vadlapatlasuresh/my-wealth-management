package com.mywealthmanagement.authservice.ops;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Internal notes and escalations — the working memory of the support team.
 *
 * Without these, everything an agent learns on a call dies when they hang up, and the customer
 * explains their problem again to the next person. Notes are what turn the 360 view from a
 * snapshot into a record.
 *
 * Notes are append-only and ops-only: never shown to the customer, never edited.
 */
@RestController
@RequestMapping("/api/v1/ops/cases")
@RequiredArgsConstructor
public class OpsCaseController {

    private final OpsCustomerNoteRepository notes;
    private final OpsEscalationRepository escalations;
    private final UserRepository users;
    private final AuditClient auditClient;

    // ---- Notes ---------------------------------------------------------------------------------

    /** Every note on a customer, pinned first. Requires customer.view — reading is not writing. */
    @PreAuthorize("hasAuthority('customer.view')")
    @GetMapping("/customers/{userId}/notes")
    public List<Map<String, Object>> listNotes(@PathVariable String userId) {
        return notes.findByUserIdOrderByPinnedDescCreatedAtDesc(userId).stream()
                .map(OpsCaseController::noteDto).toList();
    }

    @PreAuthorize("hasAuthority('customer.note.write')")
    @PostMapping("/customers/{userId}/notes")
    public Map<String, Object> addNote(@PathVariable String userId, @RequestBody Map<String, Object> body) {
        requireCustomer(userId);
        String text = str(body.get("body"));
        if (!StringUtils.hasText(text)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A note body is required");
        }

        OpsCustomerNote note = new OpsCustomerNote();
        note.setUserId(userId);
        note.setAuthorId(actor());
        note.setBody(text.trim());
        note.setPinned(Boolean.TRUE.equals(body.get("pinned")));
        note.setCreatedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        OpsCustomerNote saved = notes.save(note);

        auditClient.recordOps(actor(), "ops.note.add", "SUCCESS", userId, null, null,
                "{\"noteId\":" + saved.getId() + ",\"pinned\":" + saved.getPinned() + "}");
        return noteDto(saved);
    }

    // ---- Escalations ---------------------------------------------------------------------------

    /** The open escalation queue, newest first. */
    @PreAuthorize("hasAuthority('customer.view')")
    @GetMapping("/escalations")
    public List<Map<String, Object>> queue() {
        return escalations.findByStatusOrderByCreatedAtDesc(OpsEscalation.STATUS_OPEN).stream()
                .map(OpsCaseController::escalationDto).toList();
    }

    @PreAuthorize("hasAuthority('customer.view')")
    @GetMapping("/customers/{userId}/escalations")
    public List<Map<String, Object>> forCustomer(@PathVariable String userId) {
        return escalations.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(OpsCaseController::escalationDto).toList();
    }

    @PreAuthorize("hasAuthority('customer.escalate')")
    @PostMapping("/customers/{userId}/escalations")
    public Map<String, Object> raise(@PathVariable String userId, @RequestBody Map<String, Object> body) {
        requireCustomer(userId);
        String summary = str(body.get("summary"));
        String severity = str(body.get("severity"));
        if (!StringUtils.hasText(summary)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A summary is required");
        }
        if (!OpsEscalation.SEVERITIES.contains(severity)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "severity must be one of " + OpsEscalation.SEVERITIES);
        }

        OpsEscalation e = new OpsEscalation();
        e.setUserId(userId);
        e.setRaisedBy(actor());
        e.setSeverity(severity);
        e.setSummary(summary.trim());
        e.setDetail(str(body.get("detail")));
        e.setAssignedTo(str(body.get("assignedTo")));
        e.setStatus(OpsEscalation.STATUS_OPEN);
        e.setCreatedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        OpsEscalation saved = escalations.save(e);

        auditClient.recordOps(actor(), "ops.escalation.raise", "SUCCESS", userId,
                severity + ": " + summary.trim(), null, "{\"escalationId\":" + saved.getId() + "}");
        return escalationDto(saved);
    }

    /** Resolve an escalation. A resolution note is required — "closed" without a why helps nobody. */
    @PreAuthorize("hasAuthority('customer.escalate')")
    @PostMapping("/escalations/{id}/resolve")
    public Map<String, Object> resolve(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        OpsEscalation e = escalations.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Escalation not found"));
        if (OpsEscalation.STATUS_RESOLVED.equals(e.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This escalation is already resolved");
        }
        String resolution = str(body.get("resolution"));
        if (!StringUtils.hasText(resolution)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "A resolution note is required — an escalation closed without one tells the "
                            + "next agent nothing.");
        }

        e.setStatus(OpsEscalation.STATUS_RESOLVED);
        e.setResolvedBy(actor());
        e.setResolvedAt(LocalDateTime.now().truncatedTo(ChronoUnit.MICROS));
        e.setResolution(resolution.trim());
        escalations.save(e);

        auditClient.recordOps(actor(), "ops.escalation.resolve", "SUCCESS", e.getUserId(),
                resolution.trim(), null, null);
        return escalationDto(e);
    }

    // ---- helpers -------------------------------------------------------------------------------

    /** Refuse to attach notes/escalations to a customer that doesn't exist — typos become orphans. */
    private void requireCustomer(String userId) {
        try {
            if (!users.existsById(Long.valueOf(userId))) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer not found");
            }
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid customer id");
        }
    }

    private static Map<String, Object> noteDto(OpsCustomerNote n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", n.getId());
        m.put("userId", n.getUserId());
        m.put("authorId", n.getAuthorId());
        m.put("body", n.getBody());
        m.put("pinned", n.getPinned());
        m.put("createdAt", n.getCreatedAt());
        return m;
    }

    private static Map<String, Object> escalationDto(OpsEscalation e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.getId());
        m.put("userId", e.getUserId());
        m.put("raisedBy", e.getRaisedBy());
        m.put("severity", e.getSeverity());
        m.put("summary", e.getSummary());
        m.put("detail", e.getDetail());
        m.put("status", e.getStatus());
        m.put("assignedTo", e.getAssignedTo());
        m.put("resolvedBy", e.getResolvedBy());
        m.put("resolvedAt", e.getResolvedAt());
        m.put("resolution", e.getResolution());
        m.put("createdAt", e.getCreatedAt());
        return m;
    }

    private static String actor() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? null : auth.getName();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o).trim();
    }
}
