package com.mywealthmanagement.realestateservice.sponsor;

import com.mywealthmanagement.realestateservice.sponsor.dto.SponsorProjectDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Manage the authenticated user's own directory history (previously listed properties).
 * Routed through the gateway at {@code /api/v1/sponsor/projects}.
 */
@RestController
@RequestMapping("/api/v1/sponsor/projects")
@RequiredArgsConstructor
public class SponsorProjectController {

    private final SponsorProjectService service;

    @GetMapping
    public ResponseEntity<List<SponsorProjectDto>> getMyProjects() {
        return ResponseEntity.ok(service.getMyProjects());
    }

    @PostMapping
    public ResponseEntity<SponsorProjectDto> create(@RequestBody SponsorProjectDto dto) {
        return ResponseEntity.ok(service.create(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<SponsorProjectDto> update(@PathVariable Long id, @RequestBody SponsorProjectDto dto) {
        return ResponseEntity.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
