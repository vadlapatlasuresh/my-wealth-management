package com.mywealthmanagement.realestateservice.deal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DealDocumentRepository extends JpaRepository<DealDocument, Long> {

    List<DealDocument> findByDealIdOrderByCreatedAtDesc(Long dealId);
}
