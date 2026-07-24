// Bill due-date optimizer — pure, side-effect-free, unit-testable. Phase 4.
// Looks at your recurring bills' due days and, when they bunch into one part of the
// month (a cash crunch), suggests which bills to move to the lighter half to smooth
// outflow. It never moves money or dates itself — it only recommends. Honest by design:
// with too few bills, or an already-even spread, it says so instead of inventing work.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Due day-of-month (1..31) for a bill, from its ISO nextDate. null if unknown. */
export function dueDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getDate();
}

// Two windows aligned to the common twice-a-month pay cycle.
const WINDOWS = [
  { label: "1st–15th", start: 1, end: 15, targetDay: 8 },
  { label: "16th–end", start: 16, end: 31, targetDay: 22 },
];

function windowFor(day) {
  return day <= 15 ? 0 : 1;
}

/**
 * @param items recurring bills: [{ name, amount, cadence, nextDate }]
 * @param opts.imbalanceThreshold fraction (0..1) above which we suggest rebalancing (default 0.3)
 * @param opts.minBills fewest bills worth optimizing (default 3)
 * Returns:
 *   { hasData, reason?, bills, windows, monthlyTotal, imbalance, heavyWindow, lightWindow,
 *     suggestions: [{ name, amount, fromDay, fromWindow, toWindow, toDayHint }],
 *     projected: [{ label, total }]  // window totals AFTER applying suggestions }
 */
export function optimizeDueDates(items = [], { imbalanceThreshold = 0.3, minBills = 3 } = {}) {
  const bills = [];
  for (const it of items || []) {
    const day = dueDay(it.nextDate);
    const amount = num(it.amount);
    if (day == null || amount <= 0) continue;
    bills.push({ name: it.name || "Bill", amount, day, window: windowFor(day) });
  }

  const windows = WINDOWS.map((w, i) => {
    const inWin = bills.filter((b) => b.window === i);
    return { ...w, index: i, total: inWin.reduce((s, b) => s + b.amount, 0), count: inWin.length };
  });
  const monthlyTotal = windows.reduce((s, w) => s + w.total, 0);

  if (bills.length < minBills || monthlyTotal <= 0) {
    return {
      hasData: false,
      reason: bills.length < minBills ? "few-bills" : "no-amounts",
      bills, windows, monthlyTotal, imbalance: 0,
      heavyWindow: null, lightWindow: null, suggestions: [], projected: windows.map((w) => ({ label: w.label, total: w.total })),
    };
  }

  const [w0, w1] = windows;
  const imbalance = Math.abs(w0.total - w1.total) / monthlyTotal;
  const heavyIdx = w0.total >= w1.total ? 0 : 1;
  const lightIdx = heavyIdx === 0 ? 1 : 0;
  const heavy = windows[heavyIdx];
  const light = windows[lightIdx];

  const suggestions = [];
  const projected = [w0.total, w1.total];

  if (imbalance > imbalanceThreshold) {
    // Greedily move the smallest heavy-window bills into the light window until the
    // spread is within threshold. Smallest-first keeps disruption minimal.
    const movable = bills.filter((b) => b.window === heavyIdx).sort((a, b) => a.amount - b.amount);
    for (const b of movable) {
      const spread = Math.abs(projected[0] - projected[1]) / monthlyTotal;
      if (spread <= imbalanceThreshold) break;
      // Don't overshoot: moving must not make the light side the new heavy side by more than it fixes.
      if (projected[lightIdx] + b.amount - (projected[heavyIdx] - b.amount) > projected[heavyIdx] - projected[lightIdx]) {
        // moving this bill flips the imbalance further than leaving it — skip only if it worsens
        const before = Math.abs(projected[heavyIdx] - projected[lightIdx]);
        const after = Math.abs((projected[heavyIdx] - b.amount) - (projected[lightIdx] + b.amount));
        if (after >= before) continue;
      }
      projected[heavyIdx] -= b.amount;
      projected[lightIdx] += b.amount;
      suggestions.push({
        name: b.name,
        amount: b.amount,
        fromDay: b.day,
        fromWindow: heavy.label,
        toWindow: light.label,
        toDayHint: light.targetDay,
      });
    }
  }

  return {
    hasData: true,
    bills: bills.sort((a, b) => a.day - b.day),
    windows,
    monthlyTotal,
    imbalance,
    heavyWindow: heavy.label,
    lightWindow: light.label,
    suggestions,
    projected: windows.map((w, i) => ({ label: w.label, total: projected[i] })),
  };
}
