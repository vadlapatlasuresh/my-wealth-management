package com.mywealthmanagement.auditservice.health;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Persistence + ordering for the health alert log. */
@DataJpaTest
class SystemHealthEventRepositoryTest {

    @Autowired
    private SystemHealthEventRepository repository;

    private SystemHealthEvent event(String svc, String status) {
        SystemHealthEvent e = new SystemHealthEvent();
        e.setServiceName(svc);
        e.setStatus(status);
        e.setDetail(status.equals("DOWN") ? "timeout" : null);
        return e;
    }

    @Test
    void storesAndReturnsNewestFirst() {
        repository.save(event("auth-service", "DOWN"));
        repository.save(event("auth-service", "UP"));
        repository.save(event("payment-service", "DOWN"));

        List<SystemHealthEvent> recent = repository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 10));

        assertThat(recent).hasSize(3);
        // Newest first; created_at is set by @CreationTimestamp on save.
        assertThat(recent.get(0).getServiceName()).isEqualTo("payment-service");
        assertThat(recent.get(0).getStatus()).isEqualTo("DOWN");
    }

    @Test
    void respectsTheLimit() {
        for (int i = 0; i < 5; i++) repository.save(event("svc" + i, "DOWN"));
        assertThat(repository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, 2))).hasSize(2);
    }
}
