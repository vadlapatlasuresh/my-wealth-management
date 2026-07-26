package com.mywealthmanagement.businessfinancialsservice.ledger;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * An immutable, balanced journal entry (GL.1). Append-only: corrections are made by posting a
 * REVERSAL entry (see {@link #reversalOf}), never by editing or deleting. Its lines are held
 * transiently and written together by {@link LedgerService}.
 */
@Entity
@Table(name = "ledger_journal_entries")
@Data
@NoArgsConstructor
public class JournalEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Column(length = 500)
    private String memo;

    /** MANUAL | INVOICE | PAYMENT | BILL | BILL_PAYMENT | PAYROLL | ADJUSTMENT | REVERSAL */
    @Column(name = "source_type", nullable = false, length = 24)
    private String sourceType = "MANUAL";

    @Column(name = "source_ref", length = 64)
    private String sourceRef;

    /** Set when this entry reverses another; points at the original entry's id. */
    @Column(name = "reversal_of")
    private Long reversalOf;

    @Column(name = "posted_at", nullable = false)
    private LocalDateTime postedAt = LocalDateTime.now();

    /* ---- Tamper-evident hash chain (GL.4). Set once at post time, never edited. ---- */
    @Column(name = "prev_hash", length = 64)
    private String prevHash;

    @Column(name = "entry_hash", length = 64)
    private String entryHash;

    @Transient
    private java.util.List<JournalLine> lines;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
