package com.mywealthmanagement.notificationservice.notification;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/** Persistence tests for push device tokens. */
@DataJpaTest
class DeviceTokenRepositoryTest {

    @Autowired
    private DeviceTokenRepository repository;

    private DeviceToken token(long userId, String value, String platform) {
        DeviceToken d = new DeviceToken();
        d.setUserId(userId);
        d.setToken(value);
        d.setPlatform(platform);
        d.setCreatedAt(LocalDateTime.now());
        return d;
    }

    @Test
    void findsAllOfAUsersTokens() {
        repository.save(token(1L, "tok-a", "web"));
        repository.save(token(1L, "tok-b", "android"));
        repository.save(token(2L, "tok-c", "web"));

        assertThat(repository.findByUserId(1L)).hasSize(2);
        assertThat(repository.findByToken("tok-c")).isPresent();
    }

    @Test
    void deleteByTokenRemovesOnlyThatDevice() {
        repository.save(token(1L, "tok-a", "web"));
        repository.save(token(1L, "tok-b", "web"));

        repository.deleteByToken("tok-a");

        assertThat(repository.findByUserId(1L)).hasSize(1);
        assertThat(repository.findByToken("tok-a")).isEmpty();
    }

    @Test
    void deleteByUserIdPurgesAllDevices() {
        repository.save(token(1L, "tok-a", "web"));
        repository.save(token(1L, "tok-b", "web"));

        repository.deleteByUserId(1L);

        assertThat(repository.findByUserId(1L)).isEmpty();
    }
}
