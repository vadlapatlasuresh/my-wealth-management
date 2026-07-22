package com.mywealthmanagement.authservice.household;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Household-owned goals & bills (Phase 3b).
 *
 * <p><b>Authorization.</b> Every method here resolves the caller's household through
 * {@link #householdOf(Long)} and then re-checks membership of the specific object's household
 * via {@link HouseholdService#requireActiveMember}. A member can therefore only ever reach
 * objects their own household owns — reading someone else's household goal is a 403, not a
 * filtered-out row.
 *
 * <p><b>Why the objects are household-owned.</b> These are new entities, not shared views of
 * personal goals. Nothing here reads or reinterprets an existing {@code user_id}-scoped row, so
 * no existing personal data can begin leaking as a side effect of joining a household.
 */
@Service
@RequiredArgsConstructor
public class HouseholdMoneyService {

    private final HouseholdService householdService;
    private final HouseholdGoalRepository goals;
    private final HouseholdGoalContributionRepository contributions;
    private final HouseholdBillRepository bills;
    private final HouseholdBillPaymentRepository payments;

    /** The caller's household id, or 409 when they aren't in one. */
    private Long householdOf(Long userId) {
        return householdService.activeMembership(userId)
                .map(HouseholdMember::getHouseholdId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "You're not in a household"));
    }

    // ---------------------------------------------------------------- goals

    @Transactional(readOnly = true)
    public List<HouseholdGoal> listGoals(Long userId) {
        return goals.findByHouseholdIdOrderByIdDesc(householdOf(userId));
    }

    @Transactional
    public HouseholdGoal createGoal(Long userId, String name, BigDecimal targetAmount, LocalDate targetDate) {
        Long householdId = householdOf(userId);
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A goal name is required");
        }
        if (targetAmount == null || targetAmount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Target amount must be greater than zero");
        }
        HouseholdGoal g = new HouseholdGoal();
        g.setHouseholdId(householdId);
        g.setName(name.trim());
        g.setTargetAmount(targetAmount);
        g.setTargetDate(targetDate);
        g.setCreatedByUserId(userId);
        return goals.save(g);
    }

    /** Load a goal ONLY if the caller's household owns it. */
    @Transactional(readOnly = true)
    public HouseholdGoal requireGoal(Long userId, Long goalId) {
        HouseholdGoal g = goals.findById(goalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Goal not found"));
        householdService.requireActiveMember(userId, g.getHouseholdId());
        return g;
    }

    @Transactional
    public HouseholdGoalContribution contribute(Long userId, Long goalId, BigDecimal amount,
                                                LocalDate occurredOn, String note) {
        HouseholdGoal g = requireGoal(userId, goalId);
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Contribution must be greater than zero");
        }
        HouseholdGoalContribution c = new HouseholdGoalContribution();
        c.setHouseholdGoalId(g.getId());
        c.setUserId(userId);           // always the caller — you can't log money "as" someone else
        c.setAmount(amount);
        c.setOccurredOn(occurredOn != null ? occurredOn : LocalDate.now());
        c.setNote(note);
        return contributions.save(c);
    }

    @Transactional(readOnly = true)
    public List<HouseholdGoalContribution> contributionsFor(Long userId, Long goalId) {
        requireGoal(userId, goalId);
        return contributions.findByHouseholdGoalIdOrderByOccurredOnDesc(goalId);
    }

    @Transactional
    public void deleteGoal(Long userId, Long goalId) {
        HouseholdGoal g = requireGoal(userId, goalId);
        goals.delete(g);
    }

    // ---------------------------------------------------------------- bills

    @Transactional(readOnly = true)
    public List<HouseholdBill> listBills(Long userId) {
        return bills.findByHouseholdIdOrderByIdDesc(householdOf(userId));
    }

    @Transactional
    public HouseholdBill createBill(Long userId, String name, BigDecimal amount, String cadence, Integer dueDay) {
        Long householdId = householdOf(userId);
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A bill name is required");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Amount must be greater than zero");
        }
        HouseholdBill b = new HouseholdBill();
        b.setHouseholdId(householdId);
        b.setName(name.trim());
        b.setAmount(amount);
        b.setCadence(normalizeCadence(cadence));
        b.setDueDay(dueDay);
        b.setCreatedByUserId(userId);
        return bills.save(b);
    }

    /** Load a bill ONLY if the caller's household owns it. */
    @Transactional(readOnly = true)
    public HouseholdBill requireBill(Long userId, Long billId) {
        HouseholdBill b = bills.findById(billId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bill not found"));
        householdService.requireActiveMember(userId, b.getHouseholdId());
        return b;
    }

    @Transactional
    public HouseholdBillPayment payBill(Long userId, Long billId, BigDecimal amount, LocalDate paidOn) {
        HouseholdBill b = requireBill(userId, billId);
        HouseholdBillPayment p = new HouseholdBillPayment();
        p.setHouseholdBillId(b.getId());
        p.setPaidByUserId(userId);     // always the caller — "who paid what" must be truthful
        p.setAmount(amount != null && amount.signum() > 0 ? amount : b.getAmount());
        p.setPaidOn(paidOn != null ? paidOn : LocalDate.now());
        return payments.save(p);
    }

    @Transactional(readOnly = true)
    public List<HouseholdBillPayment> paymentsFor(Long userId, Long billId) {
        requireBill(userId, billId);
        return payments.findByHouseholdBillIdOrderByPaidOnDesc(billId);
    }

    @Transactional
    public void deleteBill(Long userId, Long billId) {
        HouseholdBill b = requireBill(userId, billId);
        bills.delete(b);
    }

    private static String normalizeCadence(String cadence) {
        String c = cadence == null ? "MONTHLY" : cadence.trim().toUpperCase();
        return switch (c) {
            case "WEEKLY", "MONTHLY", "YEARLY" -> c;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cadence must be WEEKLY, MONTHLY or YEARLY");
        };
    }
}
