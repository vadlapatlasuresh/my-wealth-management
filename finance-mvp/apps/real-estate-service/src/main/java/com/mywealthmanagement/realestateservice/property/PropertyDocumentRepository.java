package com.mywealthmanagement.realestateservice.property;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PropertyDocumentRepository extends JpaRepository<PropertyDocument, Long> {

    List<PropertyDocument> findByPropertyIdOrderByCreatedAtDescIdDesc(Long propertyId);

    List<PropertyDocument> findByPropertyIdAndExpenseIdOrderByCreatedAtDescIdDesc(Long propertyId, Long expenseId);

    void deleteByExpenseId(Long expenseId);

    void deleteByUserId(Long userId);
}
