package com.mywealthmanagement.realestateservice.sponsor;

import com.mywealthmanagement.realestateservice.common.Urls;
import com.mywealthmanagement.realestateservice.sponsor.dto.SponsorProjectDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.stream.Collectors;

/**
 * CRUD for a user's directory history (their previously listed properties). All writes are scoped to
 * the authenticated owner; the public read used on deal pages lives in DealService so it
 * can be gated by the deal's visibility.
 */
@Service
@RequiredArgsConstructor
public class SponsorProjectService {

    private final SponsorProjectRepository repository;

    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    public List<SponsorProjectDto> getMyProjects() {
        return repository.findByUserIdOrderByYearDescCreatedAtDesc(getUserId()).stream()
                .map(SponsorProjectService::toDto)
                .collect(Collectors.toList());
    }

    public SponsorProjectDto create(SponsorProjectDto dto) {
        SponsorProject project = new SponsorProject();
        project.setUserId(getUserId());
        apply(project, dto);
        return toDto(repository.save(project));
    }

    public SponsorProjectDto update(Long id, SponsorProjectDto dto) {
        SponsorProject project = findOwnedOrThrow(id);
        apply(project, dto);
        return toDto(repository.save(project));
    }

    public void delete(Long id) {
        repository.delete(findOwnedOrThrow(id));
    }

    private SponsorProject findOwnedOrThrow(Long id) {
        SponsorProject project = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found"));
        if (!project.getUserId().equals(getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found");
        }
        return project;
    }

    private void apply(SponsorProject project, SponsorProjectDto dto) {
        String name = dto.getName() == null ? "" : dto.getName().trim();
        if (name.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Project name is required");
        }
        project.setName(name);
        project.setDescription(dto.getDescription());
        project.setUrl(Urls.validateOrNull(dto.getUrl(), "url"));
        project.setLocation(dto.getLocation());
        project.setYear(dto.getYear());
    }

    public static SponsorProjectDto toDto(SponsorProject p) {
        return new SponsorProjectDto(
                p.getId(), p.getName(), p.getDescription(), p.getUrl(),
                p.getLocation(), p.getYear());
    }
}
