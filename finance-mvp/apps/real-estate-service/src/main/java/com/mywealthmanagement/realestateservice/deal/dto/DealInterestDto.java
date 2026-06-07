package com.mywealthmanagement.realestateservice.deal.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** A lead as shown to the deal owner — includes the interested person's contact details. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DealInterestDto {
    private Long id;
    private Long dealId;
    private String name;
    private String email;
    private String phone;
    private String message;
    private String status;
    private LocalDateTime createdAt;
}
