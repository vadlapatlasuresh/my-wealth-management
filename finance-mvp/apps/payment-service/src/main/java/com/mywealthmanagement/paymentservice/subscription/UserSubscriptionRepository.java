package com.mywealthmanagement.paymentservice.subscription;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface UserSubscriptionRepository extends JpaRepository<UserSubscription, Long> {

    Optional<UserSubscription> findByUserId(Long userId);

    /** Trials whose window has elapsed but are still marked TRIALING — driven to EXPIRED by the job. */
    List<UserSubscription> findByStatusAndTrialEndBefore(String status, LocalDateTime cutoff);
}
