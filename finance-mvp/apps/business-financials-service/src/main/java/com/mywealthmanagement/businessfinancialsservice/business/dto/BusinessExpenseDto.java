package com.mywealthmanagement.businessfinancialsservice.business.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BusinessExpenseDto {
    private Long id;
    private Long businessId;
    private LocalDate expenseDate;
    private String category;
    private String vendor;
    private String description;

    /** Own amount — set for STANDALONE, null for LINKED. */
    private BigDecimal amount;

    /** STANDALONE | LINKED */
    private String sourceMode;

    /** RECORDED | NEEDS_RECEIPT | APPROVED | REIMBURSED */
    private String status;

    private String paymentMethod;
    private Long receiptDocumentId;
    private String notes;

    /**
     * What this expense is actually worth: {@code amount} for STANDALONE, or the summed
     * magnitude of the linked transactions for LINKED. Computed server-side so web, mobile
     * and every export agree.
     */
    private BigDecimal effectiveAmount;

    private int linkCount;
    private List<LinkDto> links;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LinkDto {
        private Long id;
        private String txSource;   // MANUAL | LINKED
        private String txRef;
        private LocalDate txDate;
        private BigDecimal txAmount;
        private String txDescription;
        private String txMerchant;
        private String txAccount;
        private LocalDateTime linkedAt;
    }
}
