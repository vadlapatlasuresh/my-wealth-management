package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessReminderSettingsRepository extends JpaRepository<BusinessReminderSettings, Long> {

    Optional<BusinessReminderSettings> findByBusinessIdAndUserId(Long businessId, Long userId);

    Optional<BusinessReminderSettings> findByBusinessId(Long businessId);

    List<BusinessReminderSettings> findByEnabledTrue();

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
