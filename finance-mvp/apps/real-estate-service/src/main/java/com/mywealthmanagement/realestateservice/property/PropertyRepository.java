package com.mywealthmanagement.realestateservice.property;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PropertyRepository extends JpaRepository<Property, Long> {
    List<Property> findByUserId(Long userId);

    /** Every user who owns at least one property — drives the weekly property snapshot. */
    @Query("select distinct p.userId from Property p")
    List<Long> findDistinctUserIds();

    void deleteByUserId(Long userId);
}
