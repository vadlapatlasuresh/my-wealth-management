package com.mywealthmanagement.realestateservice.sponsor;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SponsorProjectRepository extends JpaRepository<SponsorProject, Long> {

    List<SponsorProject> findByUserIdOrderByYearDescCreatedAtDesc(Long userId);

    void deleteByUserId(Long userId);
}
