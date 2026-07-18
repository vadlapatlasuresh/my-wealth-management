package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessVendorRepository extends JpaRepository<BusinessVendor, Long> {

    List<BusinessVendor> findByUserIdAndBusinessIdOrderByVendorNameAsc(Long userId, Long businessId);

    Optional<BusinessVendor> findByUserIdAndBusinessIdAndVendorName(Long userId, Long businessId, String vendorName);

    void deleteByUserIdAndBusinessIdAndVendorName(Long userId, Long businessId, String vendorName);

    void deleteByBusinessIdAndUserId(Long businessId, Long userId);
}
