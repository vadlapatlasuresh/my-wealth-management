package com.mywealthmanagement.authservice.support.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/** Summary row for the customer-care user list. No secrets (only last-4 identifiers). */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SupportUserDto {
    private Long id;
    private String email;
    private String name;
    private String phone;
    private String accountType;
    private String businessName;
    private Boolean phoneVerified;
    private Boolean identityVerified;
    private List<String> roles;
    private LocalDateTime createdAt;
}
