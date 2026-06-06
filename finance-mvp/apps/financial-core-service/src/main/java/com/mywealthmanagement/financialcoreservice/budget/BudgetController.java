package com.mywealthmanagement.financialcoreservice.budget;

import com.mywealthmanagement.financialcoreservice.budget.dto.BudgetDto;
import com.mywealthmanagement.financialcoreservice.budget.dto.BudgetLineDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/planning/budgets")
@RequiredArgsConstructor
public class BudgetController {

    private final BudgetService budgetService;

    @GetMapping("/{month}")
    public ResponseEntity<BudgetDto> getBudget(@PathVariable String month) {
        BudgetDto budget = budgetService.getBudgetForMonth(month);
        return ResponseEntity.ok(budget);
    }

    @PutMapping("/{month}")
    public ResponseEntity<BudgetDto> putBudget(@PathVariable String month, @RequestBody List<BudgetLineDto> lines) {
        BudgetDto updatedBudget = budgetService.saveBudget(month, lines);
        return ResponseEntity.ok(updatedBudget);
    }
}
