package com.mywealthmanagement.realestateservice.deal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * A directory listing over the wire. Carries only descriptive property information and
 * off-platform contact routes — no financial terms of any kind.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DealDto {
    private Long id;

    @NotBlank(message = "title is required")
    @Size(max = 300, message = "title must be at most 300 characters")
    private String title;

    @Size(max = 100, message = "category must be at most 100 characters")
    private String category;
    @Size(max = 100, message = "subcategory must be at most 100 characters")
    private String subcategory;

    @Size(max = 5000, message = "description must be at most 5000 characters")
    private String description;
    @Size(max = 500, message = "location must be at most 500 characters")
    private String location;

    /** Required: every listing links off this domain to the poster's own site. */
    @NotBlank(message = "websiteUrl is required")
    @Size(max = 500, message = "websiteUrl must be at most 500 characters")
    private String websiteUrl;

    /** Hosted property photo URLs, in display order. */
    private List<String> imageUrls;

    @Size(max = 320, message = "contactEmail must be at most 320 characters")
    private String contactEmail;
    @Size(max = 40, message = "contactPhone must be at most 40 characters")
    private String contactPhone;

    @Size(max = 50, message = "status must be at most 50 characters")
    private String status;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
