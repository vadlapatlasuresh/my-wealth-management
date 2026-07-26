package com.mywealthmanagement.businessfinancialsservice.ledger;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * One debit or credit line of a {@link JournalEntry} (GL.1). Exactly one of {@link #debit} /
 * {@link #credit} is positive; the entry as a whole must have equal debit and credit totals.
 */
@Entity
@Table(name = "ledger_journal_lines")
@Data
@NoArgsConstructor
public class JournalLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entry_id", nullable = false)
    private Long entryId;

    @Column(name = "account_id", nullable = false)
    private Long accountId;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal debit = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal credit = BigDecimal.ZERO;

    @Column(length = 300)
    private String memo;

    @Column(nullable = false)
    private int position;

    /** Convenience for read models — the account's code/name, filled by the service on read. */
    @Transient
    private String accountCode;
    @Transient
    private String accountName;
}
