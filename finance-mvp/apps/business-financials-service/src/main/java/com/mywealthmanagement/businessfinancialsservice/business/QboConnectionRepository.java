package com.mywealthmanagement.businessfinancialsservice.business;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface QboConnectionRepository extends JpaRepository<QboConnection, Long> {
    Optional<QboConnection> findByUserId(Long userId);
}
