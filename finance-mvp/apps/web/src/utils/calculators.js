// Pure financial calculators (no React, no I/O) so the math is unit-testable and
// reusable. All inputs are coerced defensively; all functions are side-effect free.

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Simple interest: I = P · r · t (r as a percent, t in years).
 * Returns { interest, total }.
 */
export function simpleInterest(principal, annualRatePct, years) {
  const p = n(principal), r = n(annualRatePct) / 100, t = n(years);
  const interest = p * r * t;
  return { interest, total: p + interest };
}

/**
 * Compound interest with optional recurring monthly contributions.
 *  - annualRatePct: nominal annual rate (%)
 *  - years: total horizon
 *  - compoundsPerYear: 12 = monthly (default), 4 = quarterly, 1 = annually
 *  - monthlyContribution: added each month (contributions compound too)
 * Returns { futureValue, totalContributions, totalInterest, schedule: [{year, balance, contributed, interest}] }.
 */
export function compoundInterest(principal, annualRatePct, years, compoundsPerYear = 12, monthlyContribution = 0) {
  const p = n(principal), rate = n(annualRatePct) / 100, t = Math.max(0, n(years));
  const m = monthlyContribution != null ? n(monthlyContribution) : 0;
  const periods = Math.max(1, Math.round(n(compoundsPerYear)));
  const periodRate = rate / periods;
  // Contribution applied per compounding period (monthly contribution scaled to period cadence).
  const contributionPerPeriod = m * (12 / periods);

  let balance = p;
  let contributed = 0;
  const totalPeriods = Math.round(t * periods);
  const schedule = [];
  let lastInterestAccrued = 0;
  for (let i = 1; i <= totalPeriods; i++) {
    const interest = balance * periodRate;
    balance += interest + contributionPerPeriod;
    contributed += contributionPerPeriod;
    lastInterestAccrued += interest;
    if (i % periods === 0) {
      schedule.push({
        year: i / periods,
        balance: round2(balance),
        contributed: round2(p + contributed),
        interest: round2(lastInterestAccrued),
      });
    }
  }
  const totalContributions = p + contributed;
  return {
    futureValue: round2(balance),
    totalContributions: round2(totalContributions),
    totalInterest: round2(balance - totalContributions),
    schedule,
  };
}

/**
 * Mortgage / loan payoff simulation with an optional EXTRA monthly payment.
 *  - balance: current outstanding principal
 *  - annualRatePct: APR (%)
 *  - monthlyPayment: scheduled monthly payment (P&I)
 *  - extraMonthly: additional principal paid each month (default 0)
 * Returns { feasible, months, payoffMonths, totalInterest, totalPaid, schedule }.
 * feasible=false when the payment can't cover the monthly interest (never pays off).
 */
export function mortgagePayoff(balance, annualRatePct, monthlyPayment, extraMonthly = 0) {
  let bal = n(balance);
  const monthlyRate = n(annualRatePct) / 100 / 12;
  const pay = n(monthlyPayment) + n(extraMonthly);
  const MAX_MONTHS = 1200; // 100-year safety cap

  if (bal <= 0) return { feasible: true, months: 0, totalInterest: 0, totalPaid: 0, schedule: [] };
  // If the payment can't beat the first month's interest, it never amortizes.
  if (pay <= bal * monthlyRate) {
    return { feasible: false, months: Infinity, totalInterest: Infinity, totalPaid: Infinity, schedule: [] };
  }

  let months = 0, totalInterest = 0, totalPaid = 0;
  const schedule = [];
  while (bal > 0 && months < MAX_MONTHS) {
    const interest = bal * monthlyRate;
    let principal = pay - interest;
    if (principal > bal) principal = bal; // final partial payment
    const thisPayment = principal + interest;
    bal -= principal;
    totalInterest += interest;
    totalPaid += thisPayment;
    months += 1;
    if (months % 12 === 0 || bal <= 0) {
      schedule.push({ month: months, balance: round2(Math.max(0, bal)), interestPaid: round2(totalInterest) });
    }
  }
  return {
    feasible: true,
    months,
    totalInterest: round2(totalInterest),
    totalPaid: round2(totalPaid),
    schedule,
  };
}

/**
 * Compare a loan with vs. without an extra monthly payment.
 * Returns { base, withExtra, monthsSaved, interestSaved }.
 */
export function extraPaymentImpact(balance, annualRatePct, monthlyPayment, extraMonthly) {
  const base = mortgagePayoff(balance, annualRatePct, monthlyPayment, 0);
  const withExtra = mortgagePayoff(balance, annualRatePct, monthlyPayment, extraMonthly);
  const monthsSaved = base.feasible && withExtra.feasible ? base.months - withExtra.months : 0;
  const interestSaved = base.feasible && withExtra.feasible ? round2(base.totalInterest - withExtra.totalInterest) : 0;
  return { base, withExtra, monthsSaved, interestSaved };
}

/**
 * Monthly contribution needed to reach a goal `target` from `current` by a date
 * `months` away, optionally earning `annualRatePct` along the way.
 * Returns the required monthly amount (>= 0). 0 if already met.
 */
export function requiredMonthlyContribution(target, current, months, annualRatePct = 0) {
  const t = n(target), c = n(current), m = Math.max(0, Math.round(n(months)));
  const gap = t - c;
  if (gap <= 0) return 0;
  if (m === 0) return gap; // due now
  const r = n(annualRatePct) / 100 / 12;
  if (r === 0) return round2(gap / m);
  // Future value of current grows; required PMT for the remaining gap (annuity-due-free):
  const grownCurrent = c * Math.pow(1 + r, m);
  const remaining = t - grownCurrent;
  if (remaining <= 0) return 0; // growth alone reaches the target
  const factor = (Math.pow(1 + r, m) - 1) / r;
  return round2(remaining / factor);
}

/** Convert a month count into a "Xy Ym" label and an absolute payoff date from `from`. */
export function payoffDateLabel(months, from = new Date()) {
  if (!Number.isFinite(months)) return { duration: "—", date: "—" };
  const y = Math.floor(months / 12), mo = months % 12;
  const duration = [y ? `${y}y` : null, mo ? `${mo}m` : null].filter(Boolean).join(" ") || "0m";
  const d = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const date = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return { duration, date };
}

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
