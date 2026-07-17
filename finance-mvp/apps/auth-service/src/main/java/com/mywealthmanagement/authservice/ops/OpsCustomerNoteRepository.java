package com.mywealthmanagement.authservice.ops;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OpsCustomerNoteRepository extends JpaRepository<OpsCustomerNote, Long> {

    /** Pinned first, then newest — the order an agent needs them in on a live call. */
    List<OpsCustomerNote> findByUserIdOrderByPinnedDescCreatedAtDesc(String userId);
}
