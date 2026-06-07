package com.mywealthmanagement.realestateservice.deal.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** An interest as shown to the investor who submitted it, with the deal it points to. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class MyInterestDto {
    private Long id;
    private Long dealId;
    private String dealTitle;
    private String dealStatus;     // current status of the deal (OPEN/CLOSED/FUNDED…)
    private String status;         // the sponsor's lead status for this investor
    private String message;
    private LocalDateTime createdAt;
}
