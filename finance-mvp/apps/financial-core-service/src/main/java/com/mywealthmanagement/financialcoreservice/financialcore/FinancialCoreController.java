package com.mywealthmanagement.financialcoreservice.financialcore;

import com.mywealthmanagement.financialcoreservice.clients.dtos.AccountDto;
import com.mywealthmanagement.financialcoreservice.clients.dtos.TransactionDto;
import com.mywealthmanagement.financialcoreservice.financialcore.dto.SnapshotDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/me")
@RequiredArgsConstructor
public class FinancialCoreController {

    private final FinancialCoreService financialCoreService;

    @GetMapping("/snapshot")
    public ResponseEntity<SnapshotDto> getSnapshot(@RequestParam(defaultValue = "All") String range) {
        SnapshotDto snapshot = financialCoreService.getSnapshot(range);
        return ResponseEntity.ok(snapshot);
    }

    @GetMapping("/accounts")
    public ResponseEntity<List<AccountDto>> getAccounts() {
        List<AccountDto> accounts = financialCoreService.getAccounts();
        return ResponseEntity.ok(accounts);
    }

    @GetMapping("/transactions")
    public ResponseEntity<List<TransactionDto>> getTransactions() {
        List<TransactionDto> transactions = financialCoreService.getTransactions();
        return ResponseEntity.ok(transactions);
    }
}
