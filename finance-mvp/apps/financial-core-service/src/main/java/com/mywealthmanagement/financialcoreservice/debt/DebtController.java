package com.mywealthmanagement.financialcoreservice.debt;

import com.mywealthmanagement.financialcoreservice.debt.dto.DebtDto;
import com.mywealthmanagement.financialcoreservice.debt.dto.DebtScenarioDto;
import com.mywealthmanagement.financialcoreservice.debt.dto.DebtScenarioRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/planning/debt-scenarios")
@RequiredArgsConstructor
public class DebtController {

    private final DebtService debtService;

    @GetMapping
    public ResponseEntity<List<DebtDto>> getDebts() {
        List<DebtDto> debts = debtService.getDebtsByUserId();
        return ResponseEntity.ok(debts);
    }

    @PostMapping
    public ResponseEntity<DebtScenarioDto> runDebtScenario(@RequestBody DebtScenarioRequest request) {
        DebtScenarioDto scenario = debtService.runDebtScenario(request);
        return ResponseEntity.ok(scenario);
    }

    @PostMapping("/add")
    public ResponseEntity<DebtDto> addDebt(@RequestBody DebtDto debtDto) {
        DebtDto newDebt = debtService.addDebt(debtDto);
        return ResponseEntity.ok(newDebt);
    }
}
