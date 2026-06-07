package com.mywealthmanagement.platformconfigservice.app;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AppSectionRepository extends JpaRepository<AppSection, String> {
    List<AppSection> findAllByOrderBySortOrderAsc();
}
