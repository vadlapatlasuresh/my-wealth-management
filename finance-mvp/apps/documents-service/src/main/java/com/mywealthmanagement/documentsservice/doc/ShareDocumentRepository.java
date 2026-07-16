package com.mywealthmanagement.documentsservice.doc;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ShareDocumentRepository extends JpaRepository<ShareDocument, Long> {
    List<ShareDocument> findByShareId(Long shareId);
    List<ShareDocument> findByDocumentId(Long documentId);
    void deleteByShareId(Long shareId);
    void deleteByDocumentId(Long documentId);
}
