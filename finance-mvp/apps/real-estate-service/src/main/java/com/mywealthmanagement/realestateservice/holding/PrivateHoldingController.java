package com.mywealthmanagement.realestateservice.holding;

import com.mywealthmanagement.realestateservice.holding.dto.HoldingEntryDto;
import com.mywealthmanagement.realestateservice.holding.dto.HoldingSummaryDto;
import com.mywealthmanagement.realestateservice.holding.dto.PrivateHoldingDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST API for the user's private co-ownership positions. Routed through the gateway at
 * {@code /api/v1/private-holdings}.
 *
 * <p>Read-and-record only: nothing here offers, prices, or transfers an interest. The one
 * endpoint that touches the Deal Room, {@code /from-deal/{dealId}}, copies a listing's
 * descriptive fields into a new holding after the user has invested elsewhere.
 */
@RestController
@RequestMapping("/api/v1/private-holdings")
@RequiredArgsConstructor
public class PrivateHoldingController {

    private final PrivateHoldingService service;

    @GetMapping
    public ResponseEntity<List<PrivateHoldingDto>> list() {
        return ResponseEntity.ok(service.getHoldings());
    }

    /** Portfolio totals and concentration breakdowns. Literal path before /{id}. */
    @GetMapping("/summary")
    public ResponseEntity<HoldingSummaryDto> summary() {
        return ResponseEntity.ok(service.getSummary());
    }

    /** Vocabulary for the UI dropdowns. */
    @GetMapping("/taxonomy")
    public ResponseEntity<Map<String, Object>> taxonomy() {
        Map<String, Object> t = new java.util.LinkedHashMap<>();
        t.put("entityTypes", HoldingTaxonomy.ENTITY_TYPES);
        t.put("assetTypes", HoldingTaxonomy.ASSET_TYPES);
        t.put("statuses", HoldingTaxonomy.STATUSES);
        t.put("directions", HoldingTaxonomy.DIRECTIONS);
        t.put("categories", HoldingTaxonomy.CATEGORIES);
        return ResponseEntity.ok(t);
    }

    @PostMapping
    public ResponseEntity<PrivateHoldingDto> create(@Valid @RequestBody PrivateHoldingDto dto) {
        return ResponseEntity.ok(service.create(dto));
    }

    /**
     * Start tracking a position the user says they took in a Deal Room listing. Records a
     * decision already made off-platform; moves no money and notifies no one.
     */
    @PostMapping("/from-deal/{dealId}")
    public ResponseEntity<PrivateHoldingDto> trackFromDeal(@PathVariable Long dealId) {
        return ResponseEntity.ok(service.trackFromDeal(dealId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PrivateHoldingDto> get(@PathVariable Long id) {
        return ResponseEntity.ok(service.getHolding(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<PrivateHoldingDto> update(@PathVariable Long id,
                                                    @Valid @RequestBody PrivateHoldingDto dto) {
        return ResponseEntity.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    // ---- capital account ledger ----

    @GetMapping("/{id}/entries")
    public ResponseEntity<List<HoldingEntryDto>> entries(@PathVariable Long id) {
        return ResponseEntity.ok(service.getEntries(id));
    }

    @PostMapping("/{id}/entries")
    public ResponseEntity<HoldingEntryDto> addEntry(@PathVariable Long id,
                                                    @Valid @RequestBody HoldingEntryDto dto) {
        return ResponseEntity.ok(service.addEntry(id, dto));
    }

    @DeleteMapping("/{id}/entries/{entryId}")
    public ResponseEntity<Void> deleteEntry(@PathVariable Long id, @PathVariable Long entryId) {
        service.deleteEntry(id, entryId);
        return ResponseEntity.noContent().build();
    }
}
