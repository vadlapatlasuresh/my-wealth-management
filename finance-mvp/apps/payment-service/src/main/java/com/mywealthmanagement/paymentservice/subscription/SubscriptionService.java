package com.mywealthmanagement.paymentservice.subscription;

import com.mywealthmanagement.paymentservice.audit.AuditClient;
import com.mywealthmanagement.paymentservice.payment.provider.PaymentProvider;
import com.mywealthmanagement.paymentservice.subscription.dto.EntitlementsDto;
import com.mywealthmanagement.paymentservice.subscription.dto.PlanDto;
import com.mywealthmanagement.paymentservice.subscription.dto.PlanFeatureDto;
import com.mywealthmanagement.paymentservice.subscription.dto.SubscriptionDto;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Subscription lifecycle: plan catalog reads, the free trial, checkout/activation (via the
 * payment provider), plan change (upgrade/downgrade + cycle switch), cancellation, and the
 * entitlements that back feature gating.
 *
 * State machine:
 *   (none) --startTrial--> TRIALING --activate--> ACTIVE
 *   TRIALING --trial elapses--> EXPIRED --activate--> ACTIVE
 *   ACTIVE --cancel--> ACTIVE (cancelAtPeriodEnd) --period end--> CANCELED
 *   TRIALING --cancel--> CANCELED
 *   ACTIVE --failed renewal--> PAST_DUE --activate--> ACTIVE
 */
@Service
@RequiredArgsConstructor
public class SubscriptionService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionService.class);

    private final SubscriptionPlanRepository planRepository;
    private final PlanFeatureRepository featureRepository;
    private final UserSubscriptionRepository subscriptionRepository;
    private final PaymentProvider paymentProvider;
    private final AuditClient auditClient;

    private Long currentUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    // ---------------------------------------------------------------- catalog

    /** Full active-plan catalog with feature lists — the source for the tier feature pages. */
    public List<PlanDto> getPlans() {
        return planRepository.findByActiveTrueOrderBySortOrderAsc().stream()
                .map(this::toPlanDto)
                .toList();
    }

    public PlanDto getPlan(String planKey) {
        SubscriptionPlan plan = requirePlan(planKey);
        return toPlanDto(plan);
    }

    private SubscriptionPlan requirePlan(String planKey) {
        if (planKey == null || planKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A plan is required");
        }
        return planRepository.findById(planKey)
                .filter(SubscriptionPlan::getActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown plan: " + planKey));
    }

    private PlanDto toPlanDto(SubscriptionPlan plan) {
        PlanDto dto = new PlanDto();
        dto.setPlanKey(plan.getPlanKey());
        dto.setName(plan.getName());
        dto.setTagline(plan.getTagline());
        dto.setTier(plan.getTier());
        dto.setCurrency(plan.getCurrency());
        dto.setMonthlyPrice(plan.getMonthlyPrice());
        BigDecimal annual = plan.resolvedAnnualPrice();
        dto.setAnnualPrice(annual);
        dto.setAnnualMonthlyEquivalent(annual.divide(BigDecimal.valueOf(12), 2, RoundingMode.HALF_UP));
        // Savings vs paying the monthly price for a full year.
        BigDecimal fullYear = plan.getMonthlyPrice().multiply(BigDecimal.valueOf(12));
        int savings = 0;
        if (fullYear.compareTo(BigDecimal.ZERO) > 0) {
            savings = fullYear.subtract(annual)
                    .multiply(BigDecimal.valueOf(100))
                    .divide(fullYear, 0, RoundingMode.HALF_UP)
                    .intValue();
        }
        dto.setAnnualSavingsPercent(Math.max(0, savings));
        dto.setTrialDays(plan.getTrialDays());
        dto.setAccent(plan.getAccent());
        dto.setFeatures(featureRepository.findByPlanKeyOrderBySortOrderAsc(plan.getPlanKey()).stream()
                .map(this::toFeatureDto)
                .toList());
        return dto;
    }

    private PlanFeatureDto toFeatureDto(PlanFeature f) {
        PlanFeatureDto dto = new PlanFeatureDto();
        dto.setFeatureKey(f.getFeatureKey());
        dto.setLabel(f.getLabel());
        dto.setDescription(f.getDescription());
        dto.setEnabled(f.getEnabled());
        return dto;
    }

    // ---------------------------------------------------------------- read state

    /** The signed-in user's subscription, lazily expiring an elapsed trial first. */
    @Transactional
    public SubscriptionDto getMySubscription() {
        Optional<UserSubscription> found = subscriptionRepository.findByUserId(currentUserId());
        if (found.isEmpty()) {
            SubscriptionDto none = new SubscriptionDto();
            none.setSubscribed(false);
            none.setStatus("NONE");
            return none;
        }
        UserSubscription sub = expireIfElapsed(found.get());
        return toSubscriptionDto(sub);
    }

    /** Resolved entitlements for feature gating (plan features ∩ enabled), NONE => empty. */
    @Transactional
    public EntitlementsDto getEntitlements() {
        EntitlementsDto dto = new EntitlementsDto();
        Map<String, Boolean> features = new LinkedHashMap<>();
        Optional<UserSubscription> found = subscriptionRepository.findByUserId(currentUserId());
        if (found.isEmpty()) {
            dto.setStatus("NONE");
            dto.setEntitled(false);
            dto.setFeatures(features);
            return dto;
        }
        UserSubscription sub = expireIfElapsed(found.get());
        dto.setStatus(sub.getStatus());
        dto.setPlanKey(sub.getPlanKey());
        boolean entitled = SubscriptionStatus.isLive(sub.getStatus());
        dto.setEntitled(entitled);
        // Only a live subscription grants features; a lapsed/canceled one grants nothing.
        if (entitled) {
            for (PlanFeature f : featureRepository.findByPlanKeyAndEnabledTrueOrderBySortOrderAsc(sub.getPlanKey())) {
                features.put(f.getFeatureKey(), true);
            }
        }
        dto.setFeatures(features);
        return dto;
    }

    // ---------------------------------------------------------------- trial

    /** Start the free trial for a plan. No charge. */
    @Transactional
    public SubscriptionDto startTrial(String planKey) {
        Long userId = currentUserId();
        SubscriptionPlan plan = requirePlan(planKey);

        UserSubscription sub = subscriptionRepository.findByUserId(userId).orElse(null);
        if (sub != null) {
            sub = expireIfElapsed(sub);
            if (SubscriptionStatus.isLive(sub.getStatus())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "You already have an active subscription");
            }
            if (sub.getTrialStart() != null) {
                // A trial was already consumed once; don't hand out a second free trial.
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Your free trial has already been used — choose a plan to subscribe");
            }
        } else {
            sub = new UserSubscription();
            sub.setUserId(userId);
        }

        LocalDateTime now = LocalDateTime.now();
        sub.setPlanKey(plan.getPlanKey());
        sub.setStatus(SubscriptionStatus.TRIALING.name());
        sub.setBillingCycle(null);
        sub.setTrialStart(now);
        sub.setTrialEnd(now.plusDays(plan.getTrialDays()));
        sub.setCurrentPeriodStart(now);
        sub.setCurrentPeriodEnd(sub.getTrialEnd());
        sub.setCanceledAt(null);
        sub.setCancelAtPeriodEnd(false);
        UserSubscription saved = subscriptionRepository.save(sub);
        auditClient.record(String.valueOf(userId), "subscription.trial.start", "SUCCESS",
                "plan=" + plan.getPlanKey() + ";trialEnd=" + saved.getTrialEnd());
        return toSubscriptionDto(saved);
    }

    // ---------------------------------------------------------------- activate / checkout

    /**
     * Collect payment and activate a paid subscription. `planKey` may be null to keep the
     * user's current (e.g. trialing) plan. Throws 402 when the payment fails.
     */
    @Transactional
    public SubscriptionDto activate(String planKey, String billingCycle, String paymentToken) {
        Long userId = currentUserId();
        UserSubscription sub = subscriptionRepository.findByUserId(userId).orElse(null);

        String resolvedPlanKey = (planKey != null && !planKey.isBlank())
                ? planKey
                : (sub != null ? sub.getPlanKey() : null);
        SubscriptionPlan plan = requirePlan(resolvedPlanKey);

        String cycle = normalizeCycle(billingCycle);
        BigDecimal amount = amountFor(plan, cycle);

        // Charge via the payment provider. A blank/failed reference is treated as a decline.
        String providerRef = charge(userId, amount, plan.getCurrency(), plan.getName(), paymentToken);

        LocalDateTime now = LocalDateTime.now();
        if (sub == null) {
            sub = new UserSubscription();
            sub.setUserId(userId);
        }
        sub.setPlanKey(plan.getPlanKey());
        sub.setStatus(SubscriptionStatus.ACTIVE.name());
        sub.setBillingCycle(cycle);
        sub.setCurrentPeriodStart(now);
        sub.setCurrentPeriodEnd("ANNUAL".equals(cycle) ? now.plusYears(1) : now.plusMonths(1));
        sub.setCancelAtPeriodEnd(false);
        sub.setCanceledAt(null);
        sub.setLastAmount(amount);
        sub.setProviderRef(providerRef);
        UserSubscription saved = subscriptionRepository.save(sub);
        auditClient.record(String.valueOf(userId), "subscription.activate", "SUCCESS",
                "plan=" + plan.getPlanKey() + ";cycle=" + cycle + ";amount=" + amount);
        return toSubscriptionDto(saved);
    }

    /** Upgrade / downgrade the plan and/or switch billing cycle. */
    @Transactional
    public SubscriptionDto changePlan(String planKey, String billingCycle) {
        Long userId = currentUserId();
        UserSubscription sub = subscriptionRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "No subscription to change — start a trial or subscribe first"));
        sub = expireIfElapsed(sub);

        SubscriptionPlan newPlan = requirePlan(
                (planKey != null && !planKey.isBlank()) ? planKey : sub.getPlanKey());

        String status = sub.getStatus();
        if (SubscriptionStatus.EXPIRED.name().equals(status)
                || SubscriptionStatus.CANCELED.name().equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This subscription is no longer active — subscribe to continue");
        }

        if (SubscriptionStatus.TRIALING.name().equals(status)) {
            // Still trialing: just switch the plan (and remember a preferred cycle). No charge yet.
            sub.setPlanKey(newPlan.getPlanKey());
            if (billingCycle != null && !billingCycle.isBlank()) {
                sub.setBillingCycle(normalizeCycle(billingCycle));
            }
            UserSubscription saved = subscriptionRepository.save(sub);
            auditClient.record(String.valueOf(userId), "subscription.change", "SUCCESS",
                    "plan=" + newPlan.getPlanKey() + ";trialing");
            return toSubscriptionDto(saved);
        }

        // ACTIVE / PAST_DUE: re-charge for the new plan/cycle now, then apply.
        String cycle = normalizeCycle(billingCycle != null && !billingCycle.isBlank()
                ? billingCycle : sub.getBillingCycle());
        BigDecimal amount = amountFor(newPlan, cycle);
        String providerRef = charge(userId, amount, newPlan.getCurrency(), newPlan.getName(), null);

        LocalDateTime now = LocalDateTime.now();
        sub.setPlanKey(newPlan.getPlanKey());
        sub.setBillingCycle(cycle);
        sub.setStatus(SubscriptionStatus.ACTIVE.name());
        sub.setCurrentPeriodStart(now);
        sub.setCurrentPeriodEnd("ANNUAL".equals(cycle) ? now.plusYears(1) : now.plusMonths(1));
        sub.setLastAmount(amount);
        sub.setProviderRef(providerRef);
        sub.setCancelAtPeriodEnd(false);
        UserSubscription saved = subscriptionRepository.save(sub);
        auditClient.record(String.valueOf(userId), "subscription.change", "SUCCESS",
                "plan=" + newPlan.getPlanKey() + ";cycle=" + cycle + ";amount=" + amount);
        return toSubscriptionDto(saved);
    }

    /** Cancel: trials end immediately; paid subs stay active until period end. */
    @Transactional
    public SubscriptionDto cancel() {
        Long userId = currentUserId();
        UserSubscription sub = subscriptionRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "No subscription to cancel"));
        sub = expireIfElapsed(sub);
        String status = sub.getStatus();
        if (SubscriptionStatus.CANCELED.name().equals(status)
                || SubscriptionStatus.EXPIRED.name().equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This subscription is already inactive");
        }

        LocalDateTime now = LocalDateTime.now();
        sub.setCanceledAt(now);
        if (SubscriptionStatus.TRIALING.name().equals(status)) {
            sub.setStatus(SubscriptionStatus.CANCELED.name());
            sub.setCurrentPeriodEnd(now);
        } else {
            // ACTIVE / PAST_DUE — keep access until the paid period ends.
            sub.setCancelAtPeriodEnd(true);
        }
        UserSubscription saved = subscriptionRepository.save(sub);
        auditClient.record(String.valueOf(userId), "subscription.cancel", "SUCCESS",
                "plan=" + saved.getPlanKey() + ";atPeriodEnd=" + saved.getCancelAtPeriodEnd());
        return toSubscriptionDto(saved);
    }

    // ---------------------------------------------------------------- expiry job

    /** Batch: flip any TRIALING subscription whose trial has elapsed to EXPIRED. */
    @Transactional
    public int expireElapsedTrials() {
        List<UserSubscription> due = subscriptionRepository
                .findByStatusAndTrialEndBefore(SubscriptionStatus.TRIALING.name(), LocalDateTime.now());
        for (UserSubscription sub : due) {
            sub.setStatus(SubscriptionStatus.EXPIRED.name());
        }
        if (!due.isEmpty()) {
            subscriptionRepository.saveAll(due);
            log.info("subscription-expiry: expired {} elapsed trial(s)", due.size());
        }
        return due.size();
    }

    // ---------------------------------------------------------------- helpers

    /** If a trial has elapsed, persist EXPIRED (also covers a cancelAtPeriodEnd paid sub past its end). */
    private UserSubscription expireIfElapsed(UserSubscription sub) {
        LocalDateTime now = LocalDateTime.now();
        boolean changed = false;
        if (SubscriptionStatus.TRIALING.name().equals(sub.getStatus())
                && sub.getTrialEnd() != null && sub.getTrialEnd().isBefore(now)) {
            sub.setStatus(SubscriptionStatus.EXPIRED.name());
            changed = true;
        }
        if (SubscriptionStatus.ACTIVE.name().equals(sub.getStatus())
                && Boolean.TRUE.equals(sub.getCancelAtPeriodEnd())
                && sub.getCurrentPeriodEnd() != null && sub.getCurrentPeriodEnd().isBefore(now)) {
            sub.setStatus(SubscriptionStatus.CANCELED.name());
            changed = true;
        }
        return changed ? subscriptionRepository.save(sub) : sub;
    }

    private String normalizeCycle(String cycle) {
        String c = cycle == null ? "" : cycle.trim().toUpperCase();
        if (!"MONTHLY".equals(c) && !"ANNUAL".equals(c)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Billing cycle must be MONTHLY or ANNUAL");
        }
        return c;
    }

    private BigDecimal amountFor(SubscriptionPlan plan, String cycle) {
        return "ANNUAL".equals(cycle) ? plan.resolvedAnnualPrice() : plan.getMonthlyPrice();
    }

    /**
     * Collect payment via the provider. A paymentToken beginning with "fail" (e.g. a declined
     * test card) or a blank provider reference is treated as a decline -> 402.
     */
    private String charge(Long userId, BigDecimal amount, String currency, String planName, String paymentToken) {
        if (paymentToken != null && paymentToken.toLowerCase().startsWith("fail")) {
            auditClient.record(String.valueOf(userId), "subscription.payment", "FAILURE",
                    "amount=" + amount + ";reason=declined");
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "Payment was declined. Please try a different payment method.");
        }
        String ref;
        try {
            ref = paymentProvider.createPayment(amount, currency, "Subscription: " + planName);
        } catch (Exception e) {
            log.warn("subscription payment error for user {}: {}", userId, e.getMessage());
            auditClient.record(String.valueOf(userId), "subscription.payment", "FAILURE",
                    "amount=" + amount + ";error=" + e.getMessage());
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "We couldn't process your payment. Please try again.");
        }
        if (ref == null || ref.isBlank()) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "We couldn't process your payment. Please try again.");
        }
        return ref;
    }

    private SubscriptionDto toSubscriptionDto(UserSubscription sub) {
        SubscriptionDto dto = new SubscriptionDto();
        dto.setSubscribed(true);
        dto.setStatus(sub.getStatus());
        dto.setPlanKey(sub.getPlanKey());
        planRepository.findById(sub.getPlanKey()).ifPresent(p -> dto.setPlanName(p.getName()));
        dto.setBillingCycle(sub.getBillingCycle());
        dto.setTrialStart(sub.getTrialStart());
        dto.setTrialEnd(sub.getTrialEnd());
        dto.setCurrentPeriodEnd(sub.getCurrentPeriodEnd());
        dto.setCancelAtPeriodEnd(Boolean.TRUE.equals(sub.getCancelAtPeriodEnd()));
        dto.setLastAmount(sub.getLastAmount());

        boolean inTrial = SubscriptionStatus.TRIALING.name().equals(sub.getStatus())
                && sub.getTrialEnd() != null && sub.getTrialEnd().isAfter(LocalDateTime.now());
        dto.setInTrial(inTrial);
        dto.setActive(SubscriptionStatus.isLive(sub.getStatus()));

        int remaining = 0;
        if (inTrial) {
            long hours = ChronoUnit.HOURS.between(LocalDateTime.now(), sub.getTrialEnd());
            remaining = (int) Math.max(0, Math.ceil(hours / 24.0));
        }
        dto.setTrialDaysRemaining(remaining);
        return dto;
    }
}
