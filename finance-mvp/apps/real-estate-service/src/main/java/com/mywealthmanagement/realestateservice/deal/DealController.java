package com.mywealthmanagement.realestateservice.deal;

import com.mywealthmanagement.realestateservice.deal.dto.DealDocumentDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealInterestDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealInterestRequest;
import com.mywealthmanagement.realestateservice.deal.dto.MyInterestDto;
import com.mywealthmanagement.realestateservice.config.JwtService;
import com.mywealthmanagement.realestateservice.sponsor.dto.SponsorProjectDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

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
    private final JwtService jwtService;

    @GetMapping
    public ResponseEntity<List<DealDto>> getDeals() {
        return ResponseEntity.ok(dealService.getDeals());
    }

    /** Customer-care (CARE/ADMIN) read-only view of a member's deals. Audited by the gateway. */
    @GetMapping("/support/{userId}")
    public ResponseEntity<List<DealDto>> supportDeals(
            @PathVariable Long userId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        requireSupportRole(auth);
        return ResponseEntity.ok(dealService.getDeals(userId));
    }

    private void requireSupportRole(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing token");
        }
        List<String> roles = jwtService.extractRoles(authHeader.substring(7));
        if (!roles.contains("CARE") && !roles.contains("ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer-care access required");
        }
    }

    /** Public marketplace of OPEN deals, optionally filtered/sorted/paged. Literal paths before /{id}. */
    @GetMapping("/marketplace")
    public ResponseEntity<List<DealDto>> getMarketplace(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String subcategory,
            @RequestParam(required = false) String returnType,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset) {
        return ResponseEntity.ok(dealService.getMarketplace(category, subcategory, returnType, sort, limit, offset));
    }

    /** The investor's saved/watchlisted deals. */
    @GetMapping("/watchlist")
    public ResponseEntity<List<DealDto>> getWatchlist() {
        return ResponseEntity.ok(dealService.getWatchlist());
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
    public ResponseEntity<DealDto> createDeal(@Valid @RequestBody DealDto dealDto) {
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

    /** Document links on a deal (visible when the deal is OPEN or you own it). */
    @GetMapping("/{id}/documents")
    public ResponseEntity<List<DealDocumentDto>> getDocuments(@PathVariable Long id) {
        return ResponseEntity.ok(dealService.getDocumentsForDeal(id));
    }

    /** Owner-only: attach a document link to a deal. */
    @PostMapping("/{id}/documents")
    public ResponseEntity<DealDocumentDto> addDocument(@PathVariable Long id, @RequestBody DealDocumentDto dto) {
        return ResponseEntity.ok(dealService.addDocument(id, dto));
    }

    /** Owner-only: remove a document from a deal. */
    @DeleteMapping("/{id}/documents/{docId}")
    public ResponseEntity<Void> deleteDocument(@PathVariable Long id, @PathVariable Long docId) {
        dealService.deleteDocument(id, docId);
        return ResponseEntity.noContent().build();
    }

    /** Save a deal to the investor's watchlist. */
    @PostMapping("/{id}/watch")
    public ResponseEntity<Void> watch(@PathVariable Long id) {
        dealService.watch(id);
        return ResponseEntity.noContent().build();
    }

    /** Remove a deal from the investor's watchlist. */
    @DeleteMapping("/{id}/watch")
    public ResponseEntity<Void> unwatch(@PathVariable Long id) {
        dealService.unwatch(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}")
    public ResponseEntity<DealDto> updateDeal(@PathVariable Long id, @Valid @RequestBody DealDto dealDto) {
        return ResponseEntity.ok(dealService.updateDeal(id, dealDto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteDeal(@PathVariable Long id) {
        dealService.deleteDeal(id);
        return ResponseEntity.noContent().build();
    }
}
