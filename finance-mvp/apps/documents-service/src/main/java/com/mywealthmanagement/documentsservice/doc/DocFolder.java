package com.mywealthmanagement.documentsservice.doc;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/** A user-created folder in the personal Document Center. Optionally nested via parentId. */
@Entity
@Table(name = "doc_folders")
@Data
@NoArgsConstructor
public class DocFolder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 200)
    private String name;

    /** Parent folder id, or null for a top-level folder. */
    @Column(name = "parent_id")
    private Long parentId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
