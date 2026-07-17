package com.mywealthmanagement.authservice.ops;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OpsEscalationRepository extends JpaRepository<OpsEscalation, Long> {

    List<OpsEscalation> findByStatusOrderByCreatedAtDesc(String status);

    List<OpsEscalation> findByUserIdOrderByCreatedAtDesc(String userId);

    List<OpsEscalation> findByUserIdAndStatusOrderByCreatedAtDesc(String userId, String status);
}
