package com.mywealthmanagement.financialcoreservice.debt;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Directly exercises the payoff simulation (no DB/security) to lock in accuracy:
 * freed-up minimums roll onto the next debt, interest/months are correct, and
 * non-amortizing plans are reported as "never pays off".
 */
class DebtSimulationTest {

    // simulate() doesn't touch any injected collaborators, so nulls are fine here.
    private final DebtService svc = new DebtService(null, null, null);

    private static Debt debt(long id, String name, String balance, String apr, String minPayment) {
        Debt d = new Debt(1L, name, new BigDecimal(balance), new BigDecimal(apr), new BigDecimal(minPayment));
        d.setId(id);
        return d;
    }

    @Test
    void singleZeroAprDebtPaysOffOnSchedule() {
        // $1,000 at 0% APR, $100/mo, no extra → exactly 10 months, no interest.
        DebtService.SimResult r = svc.simulate(
                List.of(debt(1, "Card", "1000", "0", "100")), "AVALANCHE", BigDecimal.ZERO, List.of());
        assertThat(r.paysOff).isTrue();
        assertThat(r.months).isEqualTo(10);
        assertThat(r.totalInterest).isEqualByComparingTo("0");
        assertThat(r.totalPaid).isEqualByComparingTo("1000");
        assertThat(r.perDebt).hasSize(1);
        assertThat(r.perDebt.get(0).getMonthsToPayoff()).isEqualTo(10);
    }

    @Test
    void freedMinimumRollsOntoTheNextDebt() {
        // A: $100 @0% min $50 → clears month 2, freeing its $50 onto B.
        // B: $1,000 @0% min $50 → without rollover would take 20 months; with rollover ~11.
        DebtService.SimResult r = svc.simulate(
                List.of(debt(1, "A", "100", "0", "50"), debt(2, "B", "1000", "0", "50")),
                "AVALANCHE", BigDecimal.ZERO, List.of());
        assertThat(r.paysOff).isTrue();
        assertThat(r.months).isEqualTo(11);                 // proves freed minimums accelerate payoff
        assertThat(r.totalInterest).isEqualByComparingTo("0");
        // A pays off first (month 2), then B.
        assertThat(r.perDebt.get(0).getName()).isEqualTo("A");
        assertThat(r.perDebt.get(0).getMonthsToPayoff()).isEqualTo(2);
        assertThat(r.perDebt.get(1).getName()).isEqualTo("B");
        assertThat(r.perDebt.get(1).getMonthsToPayoff()).isEqualTo(11);
    }

    @Test
    void avalancheIsNoCostlierThanSnowball() {
        List<Debt> debts = List.of(
                debt(1, "HighRate", "2000", "24", "60"),
                debt(2, "LowRate", "8000", "5", "120"));
        DebtService.SimResult av = svc.simulate(debts, "AVALANCHE", new BigDecimal("300"), List.of());
        DebtService.SimResult sn = svc.simulate(debts, "SNOWBALL", new BigDecimal("300"), List.of());
        assertThat(av.paysOff).isTrue();
        assertThat(sn.paysOff).isTrue();
        // Avalanche targets the 24% debt first, so it pays no more interest than snowball.
        assertThat(av.totalInterest).isLessThanOrEqualTo(sn.totalInterest);
    }

    @Test
    void payOffFirstPrioritisesTheChosenDebt() {
        // Two equal 0% debts; force B to be paid before A via priority ids.
        List<Debt> debts = List.of(
                debt(1, "A", "600", "0", "50"),
                debt(2, "B", "600", "0", "50"));
        DebtService.SimResult r = svc.simulate(debts, "AVALANCHE", new BigDecimal("100"), List.of(2L));
        assertThat(r.paysOff).isTrue();
        Integer aMonths = r.perDebt.stream().filter(d -> d.getName().equals("A")).findFirst().get().getMonthsToPayoff();
        Integer bMonths = r.perDebt.stream().filter(d -> d.getName().equals("B")).findFirst().get().getMonthsToPayoff();
        assertThat(bMonths).isLessThan(aMonths); // B cleared first because it was prioritised
    }

    @Test
    void nonAmortizingPlanIsReportedAsNeverPaysOff() {
        // $10,000 at 24% APR accrues ~$200/mo interest; a $150 minimum with no extra can't keep up.
        DebtService.SimResult r = svc.simulate(
                List.of(debt(1, "Underwater", "10000", "24", "150")), "AVALANCHE", BigDecimal.ZERO, List.of());
        assertThat(r.paysOff).isFalse();
        assertThat(r.perDebt.get(0).getPayoffDate()).isNull();
    }
}
