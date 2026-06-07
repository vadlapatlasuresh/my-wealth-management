package com.mywealthmanagement.paymentservice.payment;

import com.mywealthmanagement.paymentservice.payment.dto.BillPayIntentDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    @GetMapping("/bill-pay-intents")
    public ResponseEntity<Map<String, Object>> getBillPayIntents() {
        List<BillPayIntentDto> items = paymentService.getIntents();
        // Wrap in "items" to match the existing client.
        return ResponseEntity.ok(Map.of("items", items));
    }

    @PostMapping("/bill-pay-intents")
    public ResponseEntity<BillPayIntentDto> createBillPayIntent(@RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = body != null ? body : Map.of();
        return ResponseEntity.ok(paymentService.createIntent(payload));
    }

    @GetMapping("/bill-pay-intents/{id}")
    public ResponseEntity<BillPayIntentDto> getBillPayIntent(@PathVariable Long id) {
        return ResponseEntity.ok(paymentService.getIntent(id));
    }

    @PostMapping("/bill-pay-intents/{id}/cancel")
    public ResponseEntity<BillPayIntentDto> cancelBillPayIntent(@PathVariable Long id) {
        return ResponseEntity.ok(paymentService.cancelIntent(id));
    }

    @PostMapping("/webhook")
    public ResponseEntity<Map<String, Object>> webhook(@RequestBody(required = false) Map<String, Object> payload) {
        // Public (permitAll) mock webhook. A real implementation would verify the
        // Stripe signature using STRIPE_WEBHOOK_SECRET before processing the event.
        return ResponseEntity.ok(Map.of("received", true));
    }
}
