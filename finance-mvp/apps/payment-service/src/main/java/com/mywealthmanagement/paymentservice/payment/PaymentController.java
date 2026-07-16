package com.mywealthmanagement.paymentservice.payment;

import com.mywealthmanagement.paymentservice.config.JwtService;
import com.mywealthmanagement.paymentservice.payment.dto.BillPayIntentDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;
    private final StripeWebhookVerifier stripeWebhookVerifier;
    private final JwtService jwtService;

    @GetMapping("/bill-pay-intents")
    public ResponseEntity<Map<String, Object>> getBillPayIntents() {
        List<BillPayIntentDto> items = paymentService.getIntents();
        // Wrap in "items" to match the existing client.
        return ResponseEntity.ok(Map.of("items", items));
    }

    /** Customer-care (CARE/ADMIN) read-only view of a member's bill-pay intents. Audited by the gateway. */
    @GetMapping("/support/{userId}/bill-pay-intents")
    public ResponseEntity<Map<String, Object>> supportBillPayIntents(
            @PathVariable Long userId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        requireSupportRole(auth);
        return ResponseEntity.ok(Map.of("items", paymentService.getIntents(userId)));
    }

    private void requireSupportRole(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing token");
        }
        // Authorised by PERMISSION, not by role: "which roles may do this" is a policy decision
        // that lives in the DB (ops_role_permissions) and is retuned without a deploy. The token
        // carries the resolved keys. JwtAuthFilter already guarantees only a typ=ops token
        // authenticates here; this is the authorisation half of that.
        //
        // Reading a customer's payment history is customer.data.view. When the financial ops layer
        // lands (Phase 5) its routes get their own finance.* keys — viewing what a customer was
        // charged and MOVING their money are not the same authority.
        List<String> perms = jwtService.extractPermissions(authHeader.substring(7));
        if (!perms.contains("customer.data.view")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Missing permission: customer.data.view");
        }
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
