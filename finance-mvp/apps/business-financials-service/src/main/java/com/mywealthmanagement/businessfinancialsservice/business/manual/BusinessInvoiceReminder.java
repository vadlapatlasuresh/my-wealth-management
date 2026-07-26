package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A record that a dunning reminder for one (invoice, offset) was sent (order-to-cash,
 * Phase 1.9). The unique (invoice_id, offset_days) constraint makes a reminder fire once.
 */
@Entity
@Table(name = "business_invoice_reminders")
@Data
@NoArgsConstructor
public class BusinessInvoiceReminder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "invoice_id", nullable = false)
    private Long invoiceId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "offset_days", nullable = false)
    private int offsetDays;

    @Column(nullable = false, length = 8)
    private String channel;

    @Column(name = "delivery_status", length = 16)
    private String deliveryStatus;

    @CreationTimestamp
    @Column(name = "sent_at", nullable = false, updatable = false)
    private LocalDateTime sentAt;
}
