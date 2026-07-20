package com.mywealthmanagement.realestateservice.sponsor.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SponsorProjectDto {
    private Long id;
    private String name;
    private String description;
    private String url;
    private String location;
    private Integer year;
}
