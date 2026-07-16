package com.mywealthmanagement.auditservice.audit;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AuditCheckpointRepository extends JpaRepository<AuditCheckpoint, Long> {

    AuditCheckpoint findTopByOrderByIdDesc();

    List<AuditCheckpoint> findAllByOrderByIdAsc();
}
