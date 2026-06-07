package com.mywealthmanagement.platformconfigservice.app;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AppModuleRepository extends JpaRepository<AppModule, String> {
    List<AppModule> findAllByOrderBySortOrderAsc();
}
