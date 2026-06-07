package com.mywealthmanagement.businessfinancialsservice.business;

import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessDashboardDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ExpenseDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.InvoiceDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.PnlDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/business")
@RequiredArgsConstructor
public class BusinessController {

    private final BusinessService businessService;

    @GetMapping("/connection")
    public ResponseEntity<Map<String, Object>> getConnection() {
        QboConnection connection = businessService.getConnection();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("connected", connection.isConnected());
        body.put("companyName", connection.getCompanyName());
        body.put("lastSyncAt", connection.getLastSyncAt());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/dashboard")
    public ResponseEntity<BusinessDashboardDto> getDashboard() {
        return ResponseEntity.ok(businessService.getDashboard());
    }

    @GetMapping("/pnl")
    public ResponseEntity<PnlDto> getPnl(@RequestParam(value = "period", defaultValue = "MTD") String period) {
        return ResponseEntity.ok(businessService.getPnl(period));
    }

    @GetMapping("/invoices")
    public ResponseEntity<List<InvoiceDto>> getInvoices() {
        return ResponseEntity.ok(businessService.getInvoices());
    }

    @GetMapping("/expenses")
    public ResponseEntity<List<ExpenseDto>> getExpenses() {
        return ResponseEntity.ok(businessService.getExpenses());
    }

    @PostMapping("/sync")
    public ResponseEntity<Map<String, Object>> sync() {
        QboConnection connection = businessService.sync();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("connected", connection.isConnected());
        body.put("lastSyncAt", connection.getLastSyncAt());
        return ResponseEntity.ok(body);
    }

    @PostMapping("/connect")
    public ResponseEntity<Map<String, Object>> connect() {
        QboConnection connection = businessService.connect();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("connected", connection.isConnected());
        body.put("companyName", connection.getCompanyName());
        return ResponseEntity.ok(body);
    }
}
