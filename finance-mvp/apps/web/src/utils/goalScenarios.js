// Goal / retirement scenarios — pure, side-effect-free, unit-testable. Phase 5.
// "Monte-Carlo-lite": instead of random simulation (non-deterministic, hard to test), we
// project THREE interpretable deterministic paths from an expected return ± volatility
// (pessimistic / expected / optimistic). Same inputs → same output, every time.
// feature_key: individual.goalScenarios. Educational, not financial advice.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Future value of a lump sum + fixed monthly contributions, compounded monthly.
 * @param principal starting balance
 * @param monthly   monthly contribution
 * @param annualRate nominal annual return (e.g. 0.06)
 * @param years     horizon in years (can be fractional)
 */
export function futureValue(principal, monthly, annualRate, years) {
  const p = num(principal), m = num(monthly), r = num(annualRate) / 12;
  const n = Math.round(num(years) * 12);
  if (n <= 0) return p;
  const growth = Math.pow(1 + r, n);
  const fvPrincipal = p * growth;
  const fvContrib = r === 0 ? m * n : m * ((growth - 1) / r);
  return fvPrincipal + fvContrib;
}

/**
 * Project a retirement/goal balance across a horizon with a low/expected/high band.
 * Returns { years, totalContributions, expected, optimistic, pessimistic, growth,
 *           series: [{ age, year, low, expected, high }] } (year 0 = today).
 */
export function projectRetirement({
  currentAge = 30,
  retireAge = 65,
  currentSavings = 0,
  monthlyContribution = 0,
  annualReturn = 0.06,
  volatility = 0.03,
} = {}) {
  const years = Math.max(0, num(retireAge) - num(currentAge));
  const lowR = Math.max(0, num(annualReturn) - num(volatility));
  const highR = num(annualReturn) + num(volatility);

  const series = [];
  for (let y = 0; y <= years; y++) {
    series.push({
      age: num(currentAge) + y,
      year: y,
      low: futureValue(currentSavings, monthlyContribution, lowR, y),
      expected: futureValue(currentSavings, monthlyContribution, annualReturn, y),
      high: futureValue(currentSavings, monthlyContribution, highR, y),
    });
  }
  const last = series[series.length - 1] || { low: num(currentSavings), expected: num(currentSavings), high: num(currentSavings) };
  const totalContributions = num(currentSavings) + num(monthlyContribution) * years * 12;

  return {
    years,
    totalContributions,
    pessimistic: last.low,
    expected: last.expected,
    optimistic: last.high,
    growth: last.expected - totalContributions,
    series,
  };
}

/**
 * Monthly income a nest egg can sustain at a safe withdrawal rate (default 4% rule).
 */
export function sustainableMonthlyIncome(balance, withdrawalRate = 0.04) {
  return (num(balance) * num(withdrawalRate)) / 12;
}

/**
 * The extra monthly contribution needed to close the gap to a target balance by `years`,
 * at `annualReturn`, given the current savings. Returns 0 when already on track.
 */
export function contributionForTarget(target, currentSavings, years, annualReturn = 0.06) {
  const r = num(annualReturn) / 12;
  const n = Math.round(num(years) * 12);
  if (n <= 0) return Math.max(0, num(target) - num(currentSavings));
  const growth = Math.pow(1 + r, n);
  const fromPrincipal = num(currentSavings) * growth;
  const gap = num(target) - fromPrincipal;
  if (gap <= 0) return 0;
  const annuityFactor = r === 0 ? n : (growth - 1) / r;
  return gap / annuityFactor;
}
