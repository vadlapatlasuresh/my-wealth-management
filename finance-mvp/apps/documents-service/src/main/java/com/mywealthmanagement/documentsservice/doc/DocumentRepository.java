package com.mywealthmanagement.documentsservice.doc;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DocumentRepository extends JpaRepository<Document, Long> {
    List<Document> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<Document> findByUserIdAndFolderIdOrderByCreatedAtDesc(Long userId, Long folderId);
    List<Document> findByUserIdAndFolderIdIsNullOrderByCreatedAtDesc(Long userId);
    Optional<Document> findByIdAndUserId(Long id, Long userId);
    Optional<Document> findByUserIdAndSourceServiceAndSourceRef(Long userId, String sourceService, String sourceRef);
    long countByUserIdAndFolderId(Long userId, Long folderId);
    void deleteByUserId(Long userId);
}
