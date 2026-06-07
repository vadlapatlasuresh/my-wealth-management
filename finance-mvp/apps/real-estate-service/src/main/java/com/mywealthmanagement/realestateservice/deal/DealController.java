package com.mywealthmanagement.realestateservice.deal;

import com.mywealthmanagement.realestateservice.deal.dto.DealDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealInterestDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealInterestRequest;
import com.mywealthmanagement.realestateservice.deal.dto.MyInterestDto;
import com.mywealthmanagement.realestateservice.sponsor.dto.SponsorProjectDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST API for user-registered investment deals (real estate and other asset classes).
 * Routed through the gateway at {@code /api/v1/deals}.
 */
@RestController
@RequestMapping("/api/v1/deals")
@RequiredArgsConstructor
public class DealController {

    private final DealService dealService;

    @GetMapping
    public ResponseEntity<List<DealDto>> getDeals() {
        return ResponseEntity.ok(dealService.getDeals());
    }

    /** Public marketplace of OPEN deals, optionally filtered. Literal paths declared before /{id}. */
    @GetMapping("/marketplace")
    public ResponseEntity<List<DealDto>> getMarketplace(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String subcategory,
            @RequestParam(required = false) String returnType) {
        return ResponseEntity.ok(dealService.getMarketplace(category, subcategory, returnType));
    }

    /** The deal taxonomy (categories, subcategories, return types, …) for building UI dropdowns. */
    @GetMapping("/taxonomy")
    public ResponseEntity<Map<String, Object>> getTaxonomy() {
        return ResponseEntity.ok(dealService.getTaxonomy());
    }

    /** The deals the current investor has expressed interest in. */
    @GetMapping("/my-interests")
    public ResponseEntity<List<MyInterestDto>> getMyInterests() {
        return ResponseEntity.ok(dealService.getMyInterests());
    }

    @PostMapping
    public ResponseEntity<DealDto> createDeal(@RequestBody DealDto dealDto) {
        return ResponseEntity.ok(dealService.createDeal(dealDto));
    }

    @GetMapping("/{id}")
    public ResponseEntity<DealDto> getDeal(@PathVariable Long id) {
        return ResponseEntity.ok(dealService.getDeal(id));
    }

    /** An investor expresses interest; their contact details are shared with the deal owner. */
    @PostMapping("/{id}/interests")
    public ResponseEntity<DealInterestDto> expressInterest(
            @PathVariable Long id, @RequestBody DealInterestRequest request) {
        return ResponseEntity.ok(dealService.expressInterest(id, request));
    }

    /** Owner-only: list investors who expressed interest in this deal. */
    @GetMapping("/{id}/interests")
    public ResponseEntity<List<DealInterestDto>> getInterests(@PathVariable Long id) {
        return ResponseEntity.ok(dealService.getInterests(id));
    }

    /** Owner-only: update a lead's status (NEW/CONTACTED/COMMITTED/PASSED). */
    @PutMapping("/{id}/interests/{interestId}/status")
    public ResponseEntity<DealInterestDto> updateLeadStatus(
            @PathVariable Long id, @PathVariable Long interestId, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(dealService.updateLeadStatus(id, interestId, body.get("status")));
    }

    /** The sponsor's track record (previous projects) shown on the deal page. */
    @GetMapping("/{id}/sponsor-projects")
    public ResponseEntity<List<SponsorProjectDto>> getSponsorProjects(@PathVariable Long id) {
        return ResponseEntity.ok(dealService.getSponsorProjectsForDeal(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<DealDto> updateDeal(@PathVariable Long id, @RequestBody DealDto dealDto) {
        return ResponseEntity.ok(dealService.updateDeal(id, dealDto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteDeal(@PathVariable Long id) {
        dealService.deleteDeal(id);
        return ResponseEntity.noContent().build();
    }
}
