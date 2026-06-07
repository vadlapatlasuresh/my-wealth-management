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
    private String ssnLast4;   // last 4 only (never the full value)
    private String einLast4;
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
