package com.mywealthmanagement.documentsservice.doc;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DocumentShareRepository extends JpaRepository<DocumentShare, Long> {
    Optional<DocumentShare> findByToken(String token);
    Optional<DocumentShare> findByIdAndOwnerUserId(Long id, Long ownerUserId);
    List<DocumentShare> findByOwnerUserIdOrderByCreatedAtDesc(Long ownerUserId);
    List<DocumentShare> findByDocumentIdAndRevokedAtIsNull(Long documentId);
    List<DocumentShare> findByFolderIdAndRevokedAtIsNull(Long folderId);
    List<DocumentShare> findByDocumentId(Long documentId);
    void deleteByOwnerUserId(Long ownerUserId);
}
