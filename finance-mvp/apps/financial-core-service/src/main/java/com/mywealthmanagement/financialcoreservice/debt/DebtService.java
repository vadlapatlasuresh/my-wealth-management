package com.mywealthmanagement.financialcoreservice.debt;

import com.mywealthmanagement.financialcoreservice.debt.dto.DebtDto;
import com.mywealthmanagement.financialcoreservice.debt.dto.DebtPayoffDto;
import com.mywealthmanagement.financialcoreservice.debt.dto.DebtScenarioDto;
import com.mywealthmanagement.financialcoreservice.debt.dto.DebtScenarioRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DebtService {

    private final DebtRepository debtRepository;
    private final DebtScenarioRepository debtScenarioRepository;
    private final com.mywealthmanagement.financialcoreservice.comms.AlertNotifier alertNotifier;

    // Helper to get userId from authenticated context
    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    public List<DebtDto> getDebtsByUserId() {
        return debtRepository.findByUserId(getUserId()).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    @Transactional
    public DebtDto addDebt(DebtDto debtDto) {
        Long userId = getUserId();
        Debt debt = new Debt(userId, debtDto.getName(), debtDto.getBalance(), debtDto.getApr(), debtDto.getMinPayment());
        debt.setPlaidAccountId(debtDto.getPlaidAccountId());
        DebtDto saved = convertToDto(debtRepository.save(debt));
        // The debt set changed — any previously cached payoff scenarios for this user are now stale.
        debtScenarioRepository.deleteByUserId(userId);
        return saved;
    }

    @Transactional
    public DebtDto updateDebt(Long debtId, DebtDto debtDto) {
        Long userId = getUserId();
        Debt debt = debtRepository.findById(debtId)
                .filter(d -> userId.equals(d.getUserId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Debt not found"));
        debt.setName(debtDto.getName());
        debt.setBalance(debtDto.getBalance());
        debt.setApr(debtDto.getApr());
        debt.setMinPayment(debtDto.getMinPayment());
        // Only overwrite the account link when the caller supplies one (keeps an existing link intact).
        if (debtDto.getPlaidAccountId() != null) {
            debt.setPlaidAccountId(debtDto.getPlaidAccountId());
        }
        DebtDto saved = convertToDto(debtRepository.save(debt));
        // Balances/rates changed — drop cached scenarios so the next compare recomputes.
        debtScenarioRepository.deleteByUserId(userId);
        return saved;
    }

    @Transactional
    public void deleteDebt(Long debtId) {
        Long userId = getUserId();
        Debt debt = debtRepository.findById(debtId)
                .filter(d -> userId.equals(d.getUserId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Debt not found"));
        debtRepository.delete(debt);
        // Removing a debt changes the payoff math — drop cached scenarios so the next compare recomputes.
        debtScenarioRepository.deleteByUserId(userId);
    }

    public DebtScenarioDto runDebtScenario(DebtScenarioRequest request) {
        Long userId = getUserId();
        List<Debt> debts = debtRepository.findByUserId(userId);

        // Normalize inputs so a missing/blank payload never crashes the simulation.
        String strategy = (request.getStrategy() == null || request.getStrategy().isBlank())
                ? "AVALANCHE" : request.getStrategy().toUpperCase();
        BigDecimal extraPayment = request.getExtraPaymentMonthly() != null
                ? request.getExtraPaymentMonthly().max(BigDecimal.ZERO) : BigDecimal.ZERO;
        List<Long> priorityIds = request.getPriorityDebtIds() != null ? request.getPriorityDebtIds() : List.of();
        boolean hasPriority = !priorityIds.isEmpty();

        String liquidity = extraPayment.compareTo(BigDecimal.valueOf(500)) >= 0 ? "Low"
                : extraPayment.signum() > 0 ? "Medium" : "High";

        // No debts → trivially solved.
        if (debts.isEmpty()) {
            DebtScenarioDto dto = new DebtScenarioDto(strategy, 0, BigDecimal.ZERO, LocalDate.now(), liquidity);
            dto.setTotalPaid(BigDecimal.ZERO);
            dto.setMonthlyBudget(extraPayment);
            dto.setPaysOff(true);
            dto.setPerDebt(List.of());
            return dto;
        }

        SimResult sim = simulate(debts, strategy, extraPayment, priorityIds);
        LocalDate debtFreeDate = sim.paysOff ? LocalDate.now().plusMonths(sim.months) : null;

        DebtScenarioDto dto = new DebtScenarioDto(strategy, sim.months, sim.totalInterest, debtFreeDate, liquidity);
        dto.setTotalPaid(sim.totalPaid);
        dto.setMonthlyBudget(sim.monthlyBudget);
        dto.setPaysOff(sim.paysOff);
        dto.setPerDebt(sim.perDebt);

        // Persist a scalar summary + notify only for pure-strategy runs (not exploratory pay-off-first
        // tweaks), and only the first time a given (strategy, extra) combo is computed — so the auto-run
        // compare (3 strategies + baseline) doesn't spam notifications.
        if (!hasPriority) {
            List<DebtScenario> existing = debtScenarioRepository.findByUserIdAndStrategyAndExtraPaymentMonthly(
                    userId, strategy, extraPayment);
            boolean firstTime = existing.isEmpty();
            debtScenarioRepository.deleteAll(existing);
            debtScenarioRepository.save(new DebtScenario(userId, strategy, extraPayment,
                    sim.months, sim.totalInterest, debtFreeDate, liquidity));
            if (firstTime) {
                String extraLabel = extraPayment.signum() > 0
                        ? " with $" + extraPayment.stripTrailingZeros().toPlainString() + "/mo extra"
                        : " (minimums only)";
                String outcome = sim.paysOff
                        ? "debt-free in " + sim.months + " months with $"
                            + sim.totalInterest.setScale(0, RoundingMode.HALF_UP).toPlainString() + " total interest."
                        : "at this rate the balance never fully clears — try adding an extra payment.";
                alertNotifier.notify(userId, "DEBT", "Debt Lab strategy compared",
                        "You compared the " + prettyStrategy(strategy) + " strategy" + extraLabel + ": " + outcome);
            }
        }
        return dto;
    }

    // 50-year horizon. If a plan still owes anything past this, its minimum payments can't out-run
    // the interest — we report it as "never pays off" rather than a bogus finite date.
    private static final int MAX_MONTHS = 600;

    /**
     * Month-by-month payoff simulation with the correct snowball/avalanche mechanic: a constant
     * monthly budget (every debt's minimum + the extra) is kept whole, so when a debt clears its
     * freed-up minimum rolls onto the next target. "Pay off first" ids are attacked before the
     * strategy order. Returns accurate months, total interest, and a per-debt timeline.
     */
    SimResult simulate(List<Debt> debts, String strategy, BigDecimal extraPayment, List<Long> priorityIds) {
        List<SimDebt> sim = debts.stream().map(SimDebt::new).collect(Collectors.toList());

        BigDecimal budget = extraPayment;
        for (SimDebt d : sim) budget = budget.add(d.minPayment);

        BigDecimal totalInterest = BigDecimal.ZERO;
        int month = 0;
        boolean paysOff = true;

        while (sim.stream().anyMatch(d -> d.balance.signum() > 0)) {
            month++;
            if (month > MAX_MONTHS) { paysOff = false; break; }

            // 1) Accrue this month's interest on every unpaid debt.
            for (SimDebt d : sim) {
                if (d.balance.signum() <= 0) continue;
                BigDecimal rate = d.apr.divide(BigDecimal.valueOf(1200), 8, RoundingMode.HALF_UP);
                BigDecimal interest = d.balance.multiply(rate).setScale(2, RoundingMode.HALF_UP);
                d.balance = d.balance.add(interest);
                d.interest = d.interest.add(interest);
                totalInterest = totalInterest.add(interest);
            }

            List<SimDebt> order = orderedTargets(sim, strategy, priorityIds);
            BigDecimal available = budget;

            // 2) Pay each unpaid debt's minimum first (so minimums are always honored).
            for (SimDebt d : order) {
                if (available.signum() <= 0) break;
                if (d.balance.signum() <= 0) continue;
                BigDecimal pay = d.minPayment.min(d.balance).min(available);
                applyPayment(d, pay, month);
                available = available.subtract(pay);
            }
            // 3) Throw everything left (extra + freed-up minimums) at the debts in target order.
            for (SimDebt d : order) {
                if (available.signum() <= 0) break;
                if (d.balance.signum() <= 0) continue;
                BigDecimal pay = d.balance.min(available);
                applyPayment(d, pay, month);
                available = available.subtract(pay);
            }
        }

        List<DebtPayoffDto> perDebt = sim.stream()
                .sorted(Comparator.comparingInt((SimDebt d) -> d.payoffMonth == null ? Integer.MAX_VALUE : d.payoffMonth)
                        .thenComparing(d -> d.name == null ? "" : d.name))
                .map(d -> new DebtPayoffDto(d.id, d.name, d.startBalance, d.apr,
                        d.payoffMonth,
                        d.payoffMonth == null ? null : LocalDate.now().plusMonths(d.payoffMonth),
                        d.interest.setScale(2, RoundingMode.HALF_UP),
                        d.paid.setScale(2, RoundingMode.HALF_UP)))
                .collect(Collectors.toList());

        SimResult r = new SimResult();
        r.months = paysOff ? month : MAX_MONTHS;
        r.totalInterest = totalInterest.setScale(2, RoundingMode.HALF_UP);
        r.totalPaid = sim.stream().map(d -> d.paid).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
        r.monthlyBudget = budget.setScale(2, RoundingMode.HALF_UP);
        r.paysOff = paysOff;
        r.perDebt = perDebt;
        return r;
    }

    private void applyPayment(SimDebt d, BigDecimal pay, int month) {
        if (pay.signum() <= 0) return;
        d.balance = d.balance.subtract(pay);
        d.paid = d.paid.add(pay);
        if (d.balance.signum() <= 0 && d.payoffMonth == null) {
            d.balance = BigDecimal.ZERO;
            d.payoffMonth = month;
        }
    }

    /** Debts still owed, ordered so the extra attacks pay-off-first ids first, then the strategy order. */
    private List<SimDebt> orderedTargets(List<SimDebt> sim, String strategy, List<Long> priorityIds) {
        List<SimDebt> unpaid = sim.stream().filter(d -> d.balance.signum() > 0).collect(Collectors.toList());
        Comparator<SimDebt> byStrategy;
        if ("SNOWBALL".equals(strategy)) {
            byStrategy = Comparator.comparing((SimDebt d) -> d.balance);                       // smallest balance first
        } else if ("HYBRID".equals(strategy)) {
            byStrategy = Comparator.comparing((SimDebt d) -> d.apr).reversed().thenComparing(d -> d.balance);
        } else {
            byStrategy = Comparator.comparing((SimDebt d) -> d.apr).reversed();                // AVALANCHE: highest APR first
        }
        List<SimDebt> ordered = new ArrayList<>();
        for (Long id : priorityIds) {
            unpaid.stream().filter(d -> id.equals(d.id) && !ordered.contains(d)).findFirst().ifPresent(ordered::add);
        }
        unpaid.stream().sorted(byStrategy).filter(d -> !ordered.contains(d)).forEach(ordered::add);
        return ordered;
    }

    /** Mutable per-debt state during a simulation run. */
    private static final class SimDebt {
        final Long id; final String name; final BigDecimal startBalance; final BigDecimal apr; final BigDecimal minPayment;
        BigDecimal balance; BigDecimal interest = BigDecimal.ZERO; BigDecimal paid = BigDecimal.ZERO;
        Integer payoffMonth;
        SimDebt(Debt d) {
            this.id = d.getId();
            this.name = d.getName();
            this.apr = d.getApr() != null ? d.getApr() : BigDecimal.ZERO;
            this.minPayment = d.getMinPayment() != null ? d.getMinPayment().max(BigDecimal.ZERO) : BigDecimal.ZERO;
            this.startBalance = d.getBalance() != null ? d.getBalance() : BigDecimal.ZERO;
            this.balance = this.startBalance;
            if (this.balance.signum() <= 0) this.payoffMonth = 0; // already clear
        }
    }

    /** Aggregate result of a simulation run. */
    static final class SimResult {
        int months; BigDecimal totalInterest; BigDecimal totalPaid; BigDecimal monthlyBudget;
        boolean paysOff; List<DebtPayoffDto> perDebt;
    }

    /** "AVALANCHE" -> "Avalanche" for human-readable copy. */
    private static String prettyStrategy(String strategy) {
        if (strategy == null || strategy.isBlank()) return "payoff";
        String lower = strategy.toLowerCase();
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }

    private DebtDto convertToDto(Debt debt) {
        return new DebtDto(debt.getId(), debt.getName(), debt.getBalance(), debt.getApr(), debt.getMinPayment(),
                debt.getPlaidAccountId());
    }
}
