package com.mywealthmanagement.authservice.ops;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OpsUserRepository extends JpaRepository<OpsUser, Long> {

    Optional<OpsUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);
}
