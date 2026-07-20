package com.mywealthmanagement.realestateservice.deal.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** A recorded contact request on a listing. */
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
    private LocalDateTime createdAt;
}
