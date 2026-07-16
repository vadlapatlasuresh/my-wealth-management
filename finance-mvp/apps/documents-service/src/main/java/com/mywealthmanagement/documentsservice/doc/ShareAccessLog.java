package com.mywealthmanagement.documentsservice.doc;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/** One row per access to a shared document/folder — the owner's audit trail. */
@Entity
@Table(name = "share_access_log")
@Data
@NoArgsConstructor
public class ShareAccessLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "share_id", nullable = false)
    private Long shareId;

    @CreationTimestamp
    @Column(name = "accessed_at", nullable = false, updatable = false)
    private LocalDateTime accessedAt;

    @Column(length = 64)
    private String ip;

    @Column(name = "user_agent", length = 400)
    private String userAgent;

    /** INFO | VIEW | DOWNLOAD | DENIED. */
    @Column(name = "access_action", length = 40)
    private String accessAction;
}
