package com.mywealthmanagement.paymentservice.payment;

import com.mywealthmanagement.paymentservice.payment.dto.BillPayIntentDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;
    private final StripeWebhookVerifier stripeWebhookVerifier;

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
    public ResponseEntity<Map<String, Object>> webhook(
            @RequestBody(required = false) String payload,
            @RequestHeader(value = "Stripe-Signature", required = false) String signature) {
        // Verify the Stripe signature over the RAW body before trusting the event.
        if (!stripeWebhookVerifier.verify(payload == null ? "" : payload, signature)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("received", false, "error", "invalid signature"));
        }
        // Signature OK — a real implementation would now parse the event and update intents.
        return ResponseEntity.ok(Map.of("received", true));
    }
}
