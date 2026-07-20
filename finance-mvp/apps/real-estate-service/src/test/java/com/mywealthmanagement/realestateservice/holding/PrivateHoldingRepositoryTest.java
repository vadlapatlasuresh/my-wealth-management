package com.mywealthmanagement.realestateservice.holding;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Guards the one assumption in V12 that is not obvious: the unique index on
 * (user_id, source_deal_id) must still allow many hand-added holdings, which all carry a
 * NULL source_deal_id. That relies on NULLs being distinct in a unique index — true in
 * Postgres and in H2, but worth proving here rather than discovering in production.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class PrivateHoldingRepositoryTest {

    @Autowired
    private PrivateHoldingRepository repository;

    private PrivateHolding holding(Long userId, Long sourceDealId, String name) {
        PrivateHolding h = new PrivateHolding();
        h.setUserId(userId);
        h.setName(name);
        h.setEntityType("LLC");
        h.setStatus("ACTIVE");
        h.setSourceDealId(sourceDealId);
        return h;
    }

    @Test
    void allowsManyHandAddedHoldingsWithNoSourceListing() {
        repository.saveAndFlush(holding(1L, null, "Cedar Ridge LLC"));
        repository.saveAndFlush(holding(1L, null, "Harborview LLC"));
        repository.saveAndFlush(holding(1L, null, "Willow Creek LLC"));

        assertThat(repository.findByUserIdOrderByCreatedAtDesc(1L)).hasSize(3);
    }

    @Test
    void refusesTrackingTheSameListingTwice() {
        repository.saveAndFlush(holding(1L, 7L, "Cedar Ridge LLC"));

        assertThatThrownBy(() -> repository.saveAndFlush(holding(1L, 7L, "Cedar Ridge LLC again")))
                .isInstanceOf(Exception.class);
    }

    @Test
    void twoUsersMayEachTrackTheSameListing() {
        repository.saveAndFlush(holding(1L, 7L, "Cedar Ridge LLC"));
        repository.saveAndFlush(holding(2L, 7L, "Cedar Ridge LLC"));

        assertThat(repository.existsByUserIdAndSourceDealId(1L, 7L)).isTrue();
        assertThat(repository.existsByUserIdAndSourceDealId(2L, 7L)).isTrue();
        assertThat(repository.existsByUserIdAndSourceDealId(3L, 7L)).isFalse();
    }
}
