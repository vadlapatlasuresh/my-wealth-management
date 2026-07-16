package com.mywealthmanagement.documentsservice.doc;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DocFolderRepository extends JpaRepository<DocFolder, Long> {
    List<DocFolder> findByUserIdOrderByNameAsc(Long userId);
    Optional<DocFolder> findByIdAndUserId(Long id, Long userId);
    boolean existsByUserIdAndParentId(Long userId, Long parentId);
    void deleteByUserId(Long userId);
}
