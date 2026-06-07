package com.mywealthmanagement.paymentservice.payment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BillPayIntentRepository extends JpaRepository<BillPayIntent, Long> {

    List<BillPayIntent> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<BillPayIntent> findByIdAndUserId(Long id, Long userId);

    Optional<BillPayIntent> findByUserIdAndIdempotencyKey(Long userId, String idempotencyKey);
}
