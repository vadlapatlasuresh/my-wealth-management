package com.mywealthmanagement.platformconfigservice.content;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Verifies the consent-ledger query returns a user's acceptances newest-first. */
@DataJpaTest
class DisclaimerAcceptanceRepositoryTest {

    @Autowired
    private DisclaimerAcceptanceRepository repository;

    private DisclaimerAcceptance acceptance(long userId, String key, int version, LocalDateTime at) {
        DisclaimerAcceptance a = new DisclaimerAcceptance();
        a.setUserId(userId);
        a.setDisclaimerKey(key);
        a.setVersion(version);
        a.setAcceptedAt(at);
        return a;
    }

    @Test
    void returnsOnlyThatUsersAcceptancesNewestFirst() {
        LocalDateTime base = LocalDateTime.of(2026, 6, 1, 9, 0);
        repository.save(acceptance(1L, "terms", 1, base));
        repository.save(acceptance(1L, "privacy", 1, base.plusSeconds(5)));
        repository.save(acceptance(2L, "terms", 1, base)); // other user

        List<DisclaimerAcceptance> ledger = repository.findByUserIdOrderByAcceptedAtDesc(1L);

        assertThat(ledger).hasSize(2);
        assertThat(ledger.get(0).getDisclaimerKey()).isEqualTo("privacy"); // newest first
        assertThat(ledger.get(1).getDisclaimerKey()).isEqualTo("terms");
    }

    @Test
    void emptyLedgerForUnknownUser() {
        assertThat(repository.findByUserIdOrderByAcceptedAtDesc(999L)).isEmpty();
    }
}
