package com.mywealthmanagement.businessfinancialsservice.business;

import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessDashboardDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ExpenseDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.InvoiceDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.PnlDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/business")
@RequiredArgsConstructor
public class BusinessController {

    private final BusinessService businessService;

    @Value("${app.web-url:http://localhost:5173}")
    private String webUrl;

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
        Map<String, Object> body = new LinkedHashMap<>();
        // When a real QuickBooks app is configured, hand back the Intuit consent URL
        // so the UI can redirect the user into the OAuth flow. Otherwise fall back to
        // the demo connection so mock mode keeps working out of the box.
        if (businessService.qboConfigured()) {
            body.put("authorizeUrl", businessService.authorizeUrl());
            body.put("connected", false);
            return ResponseEntity.ok(body);
        }
        QboConnection connection = businessService.connect();
        body.put("connected", connection.isConnected());
        body.put("companyName", connection.getCompanyName());
        return ResponseEntity.ok(body);
    }

    /**
     * Intuit OAuth redirect target (permitted in SecurityConfig). Exchanges the code
     * for tokens, then bounces the browser back to the web app.
     */
    @GetMapping("/oauth/callback")
    public ResponseEntity<Void> oauthCallback(
            @RequestParam("code") String code,
            @RequestParam("realmId") String realmId,
            @RequestParam("state") String state) {
        String target = webUrl + "/mybusiness?qbo=connected";
        try {
            businessService.completeOAuth(code, realmId, state);
        } catch (Exception e) {
            target = webUrl + "/mybusiness?qbo=error";
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, URI.create(target).toString())
                .build();
    }
}
