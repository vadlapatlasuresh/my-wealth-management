package com.mywealthmanagement.realestateservice.deal;

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
 * REST API for the passive property directory. Routed through the gateway at
 * {@code /api/v1/deals}.
 *
 * <p>The surface is deliberately narrow: post, browse, save, and request a poster's
 * contact details. There is no endpoint that returns financial terms, ranks listings by
 * attractiveness, serves offering documents, or tracks anyone through a pipeline.
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
        // Authorised by PERMISSION, not by role: "which roles may do this" is a policy decision
        // that lives in the DB (ops_role_permissions) and is retuned without a deploy. The token
        // carries the resolved keys. JwtAuthFilter already guarantees only a typ=ops token
        // authenticates here; this is the authorisation half of that.
        List<String> perms = jwtService.extractPermissions(authHeader.substring(7));
        if (!perms.contains("customer.data.view")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Missing permission: customer.data.view");
        }
    }

    /** The public directory of OPEN listings, optionally filtered/paged. Literal paths before /{id}. */
    @GetMapping("/marketplace")
    public ResponseEntity<List<DealDto>> getMarketplace(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String subcategory,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Integer offset) {
        return ResponseEntity.ok(dealService.getMarketplace(category, subcategory, limit, offset));
    }

    /** The viewer's saved listings. */
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

    /**
     * Record that the caller asked for this listing's contact details. Returns the record
     * only; the poster's email is already on the listing and the browser opens a mailto:
     * link with it. Nothing is sent on anyone's behalf.
     */
    @PostMapping("/{id}/interests")
    public ResponseEntity<DealInterestDto> requestContactInfo(
            @PathVariable Long id, @RequestBody DealInterestRequest request) {
        return ResponseEntity.ok(dealService.requestContactInfo(id, request));
    }

    /** Owner-only: attach a property photo (max 2 per listing). */
    @PostMapping("/{id}/images")
    public ResponseEntity<DealDto> addImage(
            @PathVariable Long id,
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        return ResponseEntity.ok(dealService.addImage(id, file));
    }

    /**
     * A listing photo's bytes. Visible under the same rule as the listing itself. Served
     * from this authenticated route rather than a public URL, so the client fetches it as
     * a blob — object-storage keys are never exposed.
     */
    @GetMapping("/{id}/images/{imageId}")
    public ResponseEntity<byte[]> getImage(@PathVariable Long id, @PathVariable Long imageId) {
        var download = dealService.getImageBytes(id, imageId);
        return ResponseEntity.ok()
                .header("Content-Type", download.contentType() == null
                        ? "application/octet-stream" : download.contentType())
                .header("Cache-Control", "private, max-age=3600")
                .body(download.bytes());
    }

    /** Owner-only: remove a photo from a listing. */
    @DeleteMapping("/{id}/images/{imageId}")
    public ResponseEntity<Void> deleteImage(@PathVariable Long id, @PathVariable Long imageId) {
        dealService.deleteImage(id, imageId);
        return ResponseEntity.noContent().build();
    }

    /** The poster's other listings, shown as directory history on the listing page. */
    @GetMapping("/{id}/sponsor-projects")
    public ResponseEntity<List<SponsorProjectDto>> getSponsorProjects(@PathVariable Long id) {
        return ResponseEntity.ok(dealService.getSponsorProjectsForDeal(id));
    }

    /** Save a listing to the viewer's saved list. */
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
