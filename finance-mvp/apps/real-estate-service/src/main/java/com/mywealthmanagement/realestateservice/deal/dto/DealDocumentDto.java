package com.mywealthmanagement.realestateservice.deal.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DealDocumentDto {
    private Long id;
    private Long dealId;
    private String label;
    private String url;
    private String docType;
    private LocalDateTime createdAt;
}
