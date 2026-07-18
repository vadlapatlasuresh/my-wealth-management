package com.mywealthmanagement.realestateservice.property;

import com.mywealthmanagement.realestateservice.property.dto.PropertyExpenseDto;
import com.mywealthmanagement.realestateservice.property.dto.PropertyExpenseSummaryDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Expenses nested under a property: /api/v1/real-estate/{propertyId}/expenses.
 * The gateway already routes /api/v1/real-estate/** so no gateway change is needed.
 */
@RestController
@RequestMapping("/api/v1/real-estate/{propertyId}/expenses")
@RequiredArgsConstructor
public class PropertyExpenseController {

    private final PropertyExpenseService expenseService;

    @GetMapping
    public ResponseEntity<List<PropertyExpenseDto>> list(
            @PathVariable Long propertyId,
            @RequestParam(value = "year", required = false) Integer year) {
        return ResponseEntity.ok(expenseService.list(propertyId, year));
    }

    @GetMapping("/summary")
    public ResponseEntity<PropertyExpenseSummaryDto> summary(
            @PathVariable Long propertyId,
            @RequestParam(value = "year", required = false) Integer year) {
        return ResponseEntity.ok(expenseService.summary(propertyId, year));
    }

    @GetMapping("/categories")
    public ResponseEntity<List<String>> categories(@PathVariable Long propertyId) {
        return ResponseEntity.ok(expenseService.categories());
    }

    @PostMapping
    public ResponseEntity<PropertyExpenseDto> create(
            @PathVariable Long propertyId,
            @Valid @RequestBody PropertyExpenseDto dto) {
        return ResponseEntity.ok(expenseService.create(propertyId, dto));
    }

    @PutMapping("/{expenseId}")
    public ResponseEntity<PropertyExpenseDto> update(
            @PathVariable Long propertyId,
            @PathVariable Long expenseId,
            @Valid @RequestBody PropertyExpenseDto dto) {
        return ResponseEntity.ok(expenseService.update(propertyId, expenseId, dto));
    }

    @DeleteMapping("/{expenseId}")
    public ResponseEntity<Void> delete(
            @PathVariable Long propertyId,
            @PathVariable Long expenseId) {
        expenseService.delete(propertyId, expenseId);
        return ResponseEntity.noContent().build();
    }
}
