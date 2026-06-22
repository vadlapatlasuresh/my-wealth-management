package com.mywealthmanagement.auditservice.health;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SystemHealthEventRepository extends JpaRepository<SystemHealthEvent, Long> {

    /** Most recent transitions first (the ops alert feed). */
    List<SystemHealthEvent> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
