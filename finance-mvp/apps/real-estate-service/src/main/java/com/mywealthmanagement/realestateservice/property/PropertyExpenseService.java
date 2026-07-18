package com.mywealthmanagement.realestateservice.property;

import com.mywealthmanagement.realestateservice.property.dto.PropertyExpenseDto;
import com.mywealthmanagement.realestateservice.property.dto.PropertyExpenseSummaryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PropertyExpenseService {

    private final PropertyExpenseRepository expenseRepository;
    private final PropertyRepository propertyRepository;

    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    public List<String> categories() {
        return ExpenseCategories.ALL;
    }

    public List<PropertyExpenseDto> list(Long propertyId, Integer year) {
        requireOwnedProperty(propertyId);
        List<PropertyExpense> rows = (year == null)
                ? expenseRepository.findByPropertyIdOrderByExpenseDateDescIdDesc(propertyId)
                : expenseRepository.findByPropertyIdAndExpenseDateBetweenOrderByExpenseDateDescIdDesc(
                        propertyId, LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
        return rows.stream().map(this::toDto).collect(Collectors.toList());
    }

    public PropertyExpenseDto create(Long propertyId, PropertyExpenseDto dto) {
        requireOwnedProperty(propertyId);
        validateCategory(dto.getCategory());
        PropertyExpense e = new PropertyExpense();
        e.setPropertyId(propertyId);
        e.setUserId(getUserId());
        applyEditableFields(e, dto);
        return toDto(expenseRepository.save(e));
    }

    public PropertyExpenseDto update(Long propertyId, Long expenseId, PropertyExpenseDto dto) {
        requireOwnedProperty(propertyId);
        validateCategory(dto.getCategory());
        PropertyExpense e = findOwnedExpenseOrThrow(propertyId, expenseId);
        applyEditableFields(e, dto);
        return toDto(expenseRepository.save(e));
    }

    public void delete(Long propertyId, Long expenseId) {
        requireOwnedProperty(propertyId);
        PropertyExpense e = findOwnedExpenseOrThrow(propertyId, expenseId);
        expenseRepository.delete(e);
    }

    public PropertyExpenseSummaryDto summary(Long propertyId, Integer year) {
        requireOwnedProperty(propertyId);
        int y = (year != null) ? year : LocalDate.now().getYear();
        List<PropertyExpense> rows = expenseRepository
                .findByPropertyIdAndExpenseDateBetweenOrderByExpenseDateDescIdDesc(
                        propertyId, LocalDate.of(y, 1, 1), LocalDate.of(y, 12, 31));

        LocalDate today = LocalDate.now();
        boolean currentYear = (y == today.getYear());

        BigDecimal grandTotal = BigDecimal.ZERO;
        BigDecimal ytd = BigDecimal.ZERO;
        BigDecimal thisMonth = BigDecimal.ZERO;
        long missing = 0;
        // Preserve category order from the canonical list for a stable, readable breakdown.
        Map<String, BigDecimal> byCat = new LinkedHashMap<>();
        for (String c : ExpenseCategories.ALL) {
            byCat.put(c, BigDecimal.ZERO);
        }

        for (PropertyExpense e : rows) {
            BigDecimal total = totalCost(e);
            grandTotal = grandTotal.add(total);
            byCat.merge(e.getCategory(), total, BigDecimal::add);
            if (e.getReceiptRef() == null || e.getReceiptRef().isBlank()) {
                missing++;
            }
            if (currentYear) {
                if (!e.getExpenseDate().isAfter(today)) {
                    ytd = ytd.add(total);
                }
                if (e.getExpenseDate().getMonthValue() == today.getMonthValue()) {
                    thisMonth = thisMonth.add(total);
                }
            }
        }
        // For a past year, YTD is simply the full-year total; this-month is not meaningful.
        if (!currentYear) {
            ytd = grandTotal;
        }

        // Drop zero categories from the breakdown so the UI only shows what was spent.
        Map<String, BigDecimal> nonZero = byCat.entrySet().stream()
                .filter(en -> en.getValue().signum() != 0)
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue,
                        (a, b) -> a, LinkedHashMap::new));

        return new PropertyExpenseSummaryDto(
                propertyId, y, grandTotal, ytd, thisMonth, missing, rows.size(),
                PropertyExpenseSummaryDto.fromMap(nonZero));
    }

    // ---- helpers ----

    private void applyEditableFields(PropertyExpense e, PropertyExpenseDto dto) {
        e.setExpenseDate(dto.getExpenseDate());
        e.setCategory(dto.getCategory());
        e.setVendor(dto.getVendor());
        e.setDescription(dto.getDescription());
        e.setAmount(dto.getAmount() != null ? dto.getAmount() : BigDecimal.ZERO);
        e.setPaymentMethod(dto.getPaymentMethod());
        e.setReceiptRef(dto.getReceiptRef());
        e.setHours(dto.getHours());
        e.setHourlyRate(dto.getHourlyRate());
        e.setNotes(dto.getNotes());
    }

    private void validateCategory(String category) {
        if (!ExpenseCategories.isValid(category)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown expense category: " + category);
        }
    }

    /** Confirms the property exists AND belongs to the caller (mirrors PropertyService). */
    private void requireOwnedProperty(Long propertyId) {
        var property = propertyRepository.findById(propertyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Property not found"));
        if (!property.getUserId().equals(getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Property not found");
        }
    }

    private PropertyExpense findOwnedExpenseOrThrow(Long propertyId, Long expenseId) {
        PropertyExpense e = expenseRepository.findById(expenseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found"));
        // Must belong to this property AND this user.
        if (!e.getPropertyId().equals(propertyId) || !e.getUserId().equals(getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found");
        }
        return e;
    }

    private static BigDecimal laborCost(PropertyExpense e) {
        if (e.getHours() != null && e.getHourlyRate() != null) {
            return e.getHours().multiply(e.getHourlyRate());
        }
        return null;
    }

    private static BigDecimal totalCost(PropertyExpense e) {
        BigDecimal amount = e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO;
        BigDecimal labor = laborCost(e);
        return labor != null ? amount.add(labor) : amount;
    }

    private PropertyExpenseDto toDto(PropertyExpense e) {
        return new PropertyExpenseDto(
                e.getId(),
                e.getPropertyId(),
                e.getExpenseDate(),
                e.getCategory(),
                e.getVendor(),
                e.getDescription(),
                e.getAmount(),
                e.getPaymentMethod(),
                e.getReceiptRef(),
                e.getHours(),
                e.getHourlyRate(),
                e.getNotes(),
                laborCost(e),
                totalCost(e),
                e.getCreatedAt());
    }
}
