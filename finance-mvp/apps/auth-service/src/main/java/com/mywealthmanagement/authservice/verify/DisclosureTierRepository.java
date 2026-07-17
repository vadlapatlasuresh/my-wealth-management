package com.mywealthmanagement.authservice.verify;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DisclosureTierRepository extends JpaRepository<DisclosureTier, String> {

    List<DisclosureTier> findAllByOrderByMinTierAsc();
}
