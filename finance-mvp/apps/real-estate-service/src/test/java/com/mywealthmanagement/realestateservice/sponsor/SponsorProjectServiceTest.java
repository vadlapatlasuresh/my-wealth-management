package com.mywealthmanagement.realestateservice.sponsor;

import com.mywealthmanagement.realestateservice.sponsor.dto.SponsorProjectDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SponsorProjectServiceTest {

    @Mock
    private SponsorProjectRepository repository;

    @InjectMocks
    private SponsorProjectService service;

    private void authenticateAs(String userId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(userId, "Bearer t", AuthorityUtils.NO_AUTHORITIES));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private SponsorProjectDto dto() {
        SponsorProjectDto d = new SponsorProjectDto();
        d.setName("Harborview Apartments");
        d.setLocation("Tampa, FL");
        d.setYear(2023);
        d.setUrl("https://harborview.example.com");
        return d;
    }

    @Test
    void create_setsOwnerAndValidatesUrl() {
        authenticateAs("1");
        when(repository.save(any(SponsorProject.class))).thenAnswer(inv -> inv.getArgument(0));

        SponsorProjectDto created = service.create(dto());

        assertThat(created.getName()).isEqualTo("Harborview Apartments");
        assertThat(created.getUrl()).isEqualTo("https://harborview.example.com");
    }

    @Test
    void create_rejectsMissingName() {
        authenticateAs("1");
        SponsorProjectDto d = dto();
        d.setName("  ");

        assertThatThrownBy(() -> service.create(d))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("name is required");
    }

    @Test
    void update_deniedForNonOwner() {
        SponsorProject owned = new SponsorProject();
        owned.setId(5L);
        owned.setUserId(1L);
        owned.setName("Owned");
        lenient().when(repository.findById(5L)).thenReturn(Optional.of(owned));

        authenticateAs("2");
        assertThatThrownBy(() -> service.update(5L, dto()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Project not found");
    }
}
