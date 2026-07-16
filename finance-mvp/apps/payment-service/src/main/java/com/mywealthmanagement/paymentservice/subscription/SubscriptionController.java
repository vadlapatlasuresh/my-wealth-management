package com.mywealthmanagement.paymentservice.subscription;

import com.mywealthmanagement.paymentservice.subscription.dto.EntitlementsDto;
import com.mywealthmanagement.paymentservice.subscription.dto.PlanDto;
import com.mywealthmanagement.paymentservice.subscription.dto.SubscriptionDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Subscription API. The plan catalog + entitlements read straight from the DB config so a
 * price/trial/feature-flag change lands without a redeploy.
 *
 *   GET  /api/v1/subscriptions/plans              full plan catalog (tier feature pages)
 *   GET  /api/v1/subscriptions/plans/{planKey}    one plan
 *   GET  /api/v1/subscriptions/me                 the signed-in user's subscription
 *   GET  /api/v1/subscriptions/entitlements       resolved feature entitlements (gating)
 *   POST /api/v1/subscriptions/trial              start the free trial   { planKey }
 *   POST /api/v1/subscriptions/activate           checkout + activate    { planKey?, billingCycle, paymentToken? }
 *   POST /api/v1/subscriptions/change             upgrade/downgrade      { planKey?, billingCycle? }
 *   POST /api/v1/subscriptions/cancel             cancel
 */
@RestController
@RequestMapping("/api/v1/subscriptions")
@RequiredArgsConstructor
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    @GetMapping("/plans")
    public ResponseEntity<Map<String, Object>> getPlans() {
        List<PlanDto> plans = subscriptionService.getPlans();
        return ResponseEntity.ok(Map.of("plans", plans));
    }

    @GetMapping("/plans/{planKey}")
    public ResponseEntity<PlanDto> getPlan(@PathVariable String planKey) {
        return ResponseEntity.ok(subscriptionService.getPlan(planKey));
    }

    @GetMapping("/me")
    public ResponseEntity<SubscriptionDto> getMySubscription() {
        return ResponseEntity.ok(subscriptionService.getMySubscription());
    }

    @GetMapping("/entitlements")
    public ResponseEntity<EntitlementsDto> getEntitlements() {
        return ResponseEntity.ok(subscriptionService.getEntitlements());
    }

    @PostMapping("/trial")
    public ResponseEntity<SubscriptionDto> startTrial(@RequestBody(required = false) Map<String, Object> body) {
        return ResponseEntity.ok(subscriptionService.startTrial(str(body, "planKey")));
    }

    @PostMapping("/activate")
    public ResponseEntity<SubscriptionDto> activate(@RequestBody(required = false) Map<String, Object> body) {
        return ResponseEntity.ok(subscriptionService.activate(
                str(body, "planKey"), str(body, "billingCycle"), str(body, "paymentToken")));
    }

    @PostMapping("/change")
    public ResponseEntity<SubscriptionDto> change(@RequestBody(required = false) Map<String, Object> body) {
        return ResponseEntity.ok(subscriptionService.changePlan(str(body, "planKey"), str(body, "billingCycle")));
    }

    @PostMapping("/cancel")
    public ResponseEntity<SubscriptionDto> cancel() {
        return ResponseEntity.ok(subscriptionService.cancel());
    }

    private static String str(Map<String, Object> body, String key) {
        if (body == null) return null;
        Object v = body.get(key);
        return v != null ? v.toString() : null;
    }
}
