package com.mywealthmanagement.paymentservice.payment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface BillPayIntentRepository extends JpaRepository<BillPayIntent, Long> {

    List<BillPayIntent> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<BillPayIntent> findByIdAndUserId(Long id, Long userId);

    Optional<BillPayIntent> findByUserIdAndIdempotencyKey(Long userId, String idempotencyKey);

    /** Used by the reminder job: scheduled payments landing on a given date. */
    List<BillPayIntent> findByStatusAndScheduledDate(String status, LocalDate scheduledDate);

    void deleteByUserId(Long userId);
}
