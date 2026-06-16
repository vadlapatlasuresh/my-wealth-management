package com.mywealthmanagement.authservice.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserDeletionTaskRepository extends JpaRepository<UserDeletionTask, Long> {

    Optional<UserDeletionTask> findByUserIdAndTarget(Long userId, String target);

    /** Tasks still owed a (re)try — picked up by the scheduled retry. */
    List<UserDeletionTask> findByStatusAndAttemptsLessThan(String status, int attempts);
}
