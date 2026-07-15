package com.mywealthmanagement.documentsservice.doc;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ShareAccessLogRepository extends JpaRepository<ShareAccessLog, Long> {
    List<ShareAccessLog> findByShareIdOrderByAccessedAtDesc(Long shareId);
    void deleteByShareId(Long shareId);
}
