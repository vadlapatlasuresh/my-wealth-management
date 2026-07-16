package com.mywealthmanagement.authservice.support.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** Full customer-care 360 view: profile + verification + recent activity + issues encountered. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SupportUserDetailDto {
    private Long id;
    private String email;
    private String name;
    private String firstName;
    private String lastName;
    private String phone;
    private String accountType;
    private String businessName;
    // Null on the 360 view. Only GET /support/users/{id}/pii populates these, and only for a
    // caller holding customer.pii.reveal who supplied a reason — which is then audited.
    // Even then it is the last 4 only; the full value is encrypted at rest and never served.
    private String ssnLast4;
    private String einLast4;
    // Whether an SSN/EIN is on file at all. Lets the UI offer "reveal" without disclosing
    // anything, and lets an agent answer "do we have your tax ID?" without a PII access.
    private Boolean hasSsn;
    private Boolean hasEin;
    private Boolean phoneVerified;
    private Boolean identityVerified;
    private List<String> roles;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Activity pulled from the audit-service.
    private int issueCount;
    private List<Map<String, Object>> recentActivity;
    private List<Map<String, Object>> issues; // failed/denied actions ("anything encountered")
}
