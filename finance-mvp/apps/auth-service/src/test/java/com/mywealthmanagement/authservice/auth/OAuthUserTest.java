package com.mywealthmanagement.authservice.auth;

import com.mywealthmanagement.authservice.audit.AuditClient;
import com.mywealthmanagement.authservice.user.Role;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Unit tests for social (OAuth) find-or-create in {@link AuthService}. */
class OAuthUserTest {

    private AuthService service(UserRepository repo) {
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        when(encoder.encode(any())).thenReturn("hashed");
        AuditClient audit = mock(AuditClient.class);
        return new AuthService(repo, encoder, null, null, audit, null);
    }

    @Test
    void returnsExistingUserWhenEmailAlreadyKnown() {
        User existing = new User();
        existing.setName("Already Here");
        UserRepository repo = mock(UserRepository.class);
        when(repo.findByEmail("jordan@example.com")).thenReturn(Optional.of(existing));
        when(repo.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User out = service(repo).findOrCreateOAuthUser("jordan@example.com", "Jordan", "google");

        assertThat(out).isSameAs(existing);
    }

    /**
     * A password user signing in with Google keeps their password account - overwriting
     * auth_provider would falsely imply they can no longer log in with their password.
     */
    @Test
    void linkingGoogleToPasswordAccountStampsLinkWithoutChangingOrigin() {
        User existing = new User();
        existing.setAuthProvider("password");
        UserRepository repo = mock(UserRepository.class);
        when(repo.findByEmail("jordan@example.com")).thenReturn(Optional.of(existing));
        when(repo.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User out = service(repo).findOrCreateOAuthUser("jordan@example.com", "Jordan", "google");

        assertThat(out.getAuthProvider()).isEqualTo("password");
        assertThat(out.getGoogleLinkedAt()).isNotNull();
    }

    /** The link timestamp records the FIRST link, so repeat sign-ins must not move it. */
    @Test
    void relinkingDoesNotOverwriteTheOriginalLinkTimestamp() {
        LocalDateTime firstLink = LocalDateTime.now().minusDays(30);
        User existing = new User();
        existing.setAuthProvider("password");
        existing.setGoogleLinkedAt(firstLink);
        UserRepository repo = mock(UserRepository.class);
        when(repo.findByEmail("jordan@example.com")).thenReturn(Optional.of(existing));
        when(repo.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User out = service(repo).findOrCreateOAuthUser("jordan@example.com", "Jordan", "google");

        assertThat(out.getGoogleLinkedAt()).isEqualTo(firstLink);
    }

    @Test
    void newGoogleUserIsMarkedAsGoogleOriginAndLinked() {
        UserRepository repo = mock(UserRepository.class);
        when(repo.findByEmail("new@example.com")).thenReturn(Optional.empty());
        when(repo.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User out = service(repo).findOrCreateOAuthUser("new@example.com", "New Person", "google");

        assertThat(out.getAuthProvider()).isEqualTo("google");
        assertThat(out.getGoogleLinkedAt()).isNotNull();
    }

    @Test
    void provisionsNewVerifiedUserWhenUnknown() {
        UserRepository repo = mock(UserRepository.class);
        when(repo.findByEmail("new@example.com")).thenReturn(Optional.empty());
        when(repo.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User out = service(repo).findOrCreateOAuthUser("new@example.com", "New Person", "google");

        assertThat(out.getEmail()).isEqualTo("new@example.com");
        assertThat(out.getName()).isEqualTo("New Person");
        assertThat(out.getEmailVerified()).isTrue();
        assertThat(out.getRoles()).contains(Role.USER);
    }

    @Test
    void defaultsNameFromEmailPrefixWhenProviderGivesNone() {
        UserRepository repo = mock(UserRepository.class);
        when(repo.findByEmail("taylor@example.com")).thenReturn(Optional.empty());
        when(repo.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User out = service(repo).findOrCreateOAuthUser("taylor@example.com", "  ", "google");

        assertThat(out.getName()).isEqualTo("taylor");
    }
}
