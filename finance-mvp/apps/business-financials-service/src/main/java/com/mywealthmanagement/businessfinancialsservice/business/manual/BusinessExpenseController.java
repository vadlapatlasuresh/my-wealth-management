package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessExpenseDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ExpenseSummaryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * Expense records for a business. Shares the /api/v1/business/manual base with
 * {@link ManualBusinessController} (already routed by the gateway) but lives in its own
 * controller to keep that 800-line class from growing further.
 *
 * <p>Literal paths ({@code /expenses/summary}, {@code /expenses/categories}) take precedence
 * over {@code /expenses/{id}} in Spring's pattern matching, so there is no ambiguity.
 */
@RestController
@RequestMapping("/api/v1/business/manual")
@RequiredArgsConstructor
public class BusinessExpenseController {

    private final BusinessExpenseService expenseService;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /* ---------------- per-business ---------------- */

    @GetMapping("/businesses/{businessId}/expenses")
    public List<BusinessExpenseDto> list(
            @PathVariable Long businessId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String vendor,
            @RequestParam(required = false) String status) {
        return expenseService.list(userId(), businessId, from, to, category, vendor, status);
    }

    @PostMapping("/businesses/{businessId}/expenses")
    public BusinessExpenseDto create(@PathVariable Long businessId, @RequestBody BusinessExpenseDto dto) {
        return expenseService.create(userId(), businessId, dto);
    }

    @GetMapping("/businesses/{businessId}/expenses/summary")
    public ExpenseSummaryDto summary(
            @PathVariable Long businessId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return expenseService.summary(userId(), businessId, from, to);
    }

    /* ---------------- cross-business (consolidated) ---------------- */

    /** Every business's expenses — backs the "all businesses" combined export. */
    @GetMapping("/expenses")
    public List<BusinessExpenseDto> listAll(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return expenseService.listAll(userId(), from, to);
    }

    @GetMapping("/expenses/summary")
    public ExpenseSummaryDto summaryAll(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return expenseService.summary(userId(), null, from, to);
    }

    @GetMapping("/expenses/categories")
    public List<String> categories() {
        return BusinessExpenseService.SUGGESTED_CATEGORIES;
    }

    /* ---------------- single expense ---------------- */

    @PutMapping("/expenses/{id}")
    public BusinessExpenseDto update(@PathVariable Long id, @RequestBody BusinessExpenseDto dto) {
        return expenseService.update(userId(), id, dto);
    }

    @DeleteMapping("/expenses/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        expenseService.delete(userId(), id);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- transaction links ---------------- */

    /** Attach one or more ledger transactions (with their snapshot) to this expense. */
    @PostMapping("/expenses/{id}/links")
    public BusinessExpenseDto addLinks(@PathVariable Long id, @RequestBody List<BusinessExpenseDto.LinkDto> links) {
        return expenseService.addLinks(userId(), id, links);
    }

    @DeleteMapping("/expenses/{id}/links/{linkId}")
    public BusinessExpenseDto removeLink(@PathVariable Long id, @PathVariable Long linkId) {
        return expenseService.removeLink(userId(), id, linkId);
    }
}
