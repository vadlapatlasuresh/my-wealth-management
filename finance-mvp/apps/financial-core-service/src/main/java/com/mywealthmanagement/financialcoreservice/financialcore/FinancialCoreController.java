package com.mywealthmanagement.financialcoreservice.financialcore;

import com.mywealthmanagement.financialcoreservice.clients.dtos.AccountDto;
import com.mywealthmanagement.financialcoreservice.clients.dtos.TransactionDto;
import com.mywealthmanagement.financialcoreservice.financialcore.dto.SnapshotDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

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

    /** GDPR/CCPA data export — downloads the signed-in user's data as JSON. */
    @GetMapping("/export")
    public ResponseEntity<Map<String, Object>> exportData() {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"terravest-my-data.json\"")
                .contentType(MediaType.APPLICATION_JSON)
                .body(financialCoreService.exportData());
    }
}
