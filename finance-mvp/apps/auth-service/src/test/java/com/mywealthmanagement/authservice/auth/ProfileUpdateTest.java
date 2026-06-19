package com.mywealthmanagement.authservice.auth;

import com.mywealthmanagement.authservice.auth.dto.ProfileResponse;
import com.mywealthmanagement.authservice.auth.dto.UpdateProfileRequest;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the write-once SSN + identity-collected logic in
 * {@link AuthService#updateProfile}. Only UserRepository is exercised, so the
 * other collaborators are passed as null.
 */
class ProfileUpdateTest {

    private AuthService serviceFor(User stored) {
        UserRepository repo = mock(UserRepository.class);
        when(repo.findById(1L)).thenReturn(Optional.of(stored));
        when(repo.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        return new AuthService(repo, null, null, null, null, null);
    }

    @Test
    void setsSsnFirstTimeWhenNoneOnFile() {
        User u = new User();
        AuthService service = serviceFor(u);

        UpdateProfileRequest r = new UpdateProfileRequest();
        r.setSsn("123-45-6789");
        ProfileResponse out = service.updateProfile(1L, r);

        assertThat(u.getSsnLast4()).isEqualTo("6789");
        assertThat(u.getSsnEncrypted()).isEqualTo("123456789");
        assertThat(out.getSsnMasked()).isEqualTo("•••-••-6789");
    }

    @Test
    void neverOverwritesAnSsnAlreadyOnFile() {
        User u = new User();
        u.setSsnEncrypted("111111111");
        u.setSsnLast4("1111");
        AuthService service = serviceFor(u);

        UpdateProfileRequest r = new UpdateProfileRequest();
        r.setSsn("999-99-9999"); // attempt to change it
        service.updateProfile(1L, r);

        assertThat(u.getSsnLast4()).isEqualTo("1111");
        assertThat(u.getSsnEncrypted()).isEqualTo("111111111");
    }

    @Test
    void rejectsMalformedSsn() {
        User u = new User();
        AuthService service = serviceFor(u);

        UpdateProfileRequest r = new UpdateProfileRequest();
        r.setSsn("12-34"); // not 9 digits
        service.updateProfile(1L, r);

        assertThat(u.getSsnLast4()).isNull();
    }

    @Test
    void flagsIdentityVerifiedOnceFullSetIsOnFile() {
        User u = new User();
        u.setDateOfBirth(java.time.LocalDate.of(1990, 5, 1));
        u.setAddressLine1("123 Main St");
        u.setPostalCode("78701");
        AuthService service = serviceFor(u);

        UpdateProfileRequest r = new UpdateProfileRequest();
        r.setSsn("123-45-6789");
        ProfileResponse out = service.updateProfile(1L, r);

        assertThat(out.getIdentityVerified()).isTrue();
    }

    @Test
    void doesNotFlagIdentityWhenAddressMissing() {
        User u = new User();
        u.setDateOfBirth(java.time.LocalDate.of(1990, 5, 1));
        AuthService service = serviceFor(u);

        UpdateProfileRequest r = new UpdateProfileRequest();
        r.setSsn("123-45-6789"); // SSN + DOB but no address
        ProfileResponse out = service.updateProfile(1L, r);

        assertThat(out.getIdentityVerified()).isFalse();
    }
}
