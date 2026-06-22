package com.mywealthmanagement.auditservice.health;

import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** Ops view of the health alert log (recent UP/DOWN transitions). Admin/care only
 *  (enforced in SecurityConfig). */
@RestController
@RequestMapping("/api/v1/audit/health")
public class HealthController {

    private final SystemHealthEventRepository repository;

    public HealthController(SystemHealthEventRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/alerts")
    public List<Map<String, Object>> alerts(@RequestParam(defaultValue = "100") int limit) {
        int capped = Math.max(1, Math.min(limit, 500));
        return repository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, capped))
                .stream()
                .map(e -> Map.<String, Object>of(
                        "service", e.getServiceName(),
                        "status", e.getStatus(),
                        "detail", e.getDetail() == null ? "" : e.getDetail(),
                        "at", e.getCreatedAt().toString()))
                .toList();
    }
}
