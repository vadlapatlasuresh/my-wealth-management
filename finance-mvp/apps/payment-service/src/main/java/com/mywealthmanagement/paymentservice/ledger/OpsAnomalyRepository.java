package com.mywealthmanagement.paymentservice.ledger;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OpsAnomalyRepository extends JpaRepository<OpsAnomaly, Long> {

    List<OpsAnomaly> findByStatusOrderByCreatedAtDesc(String status);

    boolean existsByDedupeKey(String dedupeKey);
}
