package com.mywealthmanagement.realestateservice.deal.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Payload recorded when a viewer requests a listing's contact details. It logs that the
 * request happened (so the viewer can find the listing again under "My Interests") and
 * nothing more — the actual conversation happens off-platform via the mailto: link.
 */
@Data
@NoArgsConstructor
public class DealInterestRequest {
    private String name;
    private String email;
    private String phone;
    private String message;
}
