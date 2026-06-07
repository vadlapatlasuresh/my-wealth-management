package com.mywealthmanagement.paymentservice.payment;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "bill_pay_intents")
@Data
@NoArgsConstructor
public class BillPayIntent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(nullable = false)
    private String currency = "USD";

    @Column
    private String payee;

    @Column(name = "from_account")
    private String fromAccount;

    @Column(name = "to_account")
    private String toAccount;

    @Column(name = "payee_type")
    private String payeeType; // CREDIT_CARD | UTILITY | LOAN | PERSON | OTHER

    @Column(name = "scheduled_date")
    private LocalDate scheduledDate;

    @Column(length = 500)
    private String memo;

    @Column(name = "confirmation_number")
    private String confirmationNumber;

    @Column(name = "idempotency_key")
    private String idempotencyKey;

    @Column(nullable = false)
    private String status; // SCHEDULED | PROCESSING | COMPLETED | FAILED | CANCELED

    @Column(name = "provider_ref")
    private String providerRef;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
