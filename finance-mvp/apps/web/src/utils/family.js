// Family / kids mode — pure helpers (no React). Phase 5, backlog B3.
// feature_key: individual.family (Premium).
//
// The backend (auth-service FamilyService) is the source of truth for balances; everything here
// is either a PREVIEW of what an action will do, or a derived reading of data the server sent.
//
// One rule worth stating out loud: splitAmounts() reproduces the server's rounding exactly —
// save and give round DOWN, spend absorbs the remainder — so the preview a parent sees before
// they tap "Pay allowance" is the ledger they get after. A preview that disagrees with the
// result by a cent is the kind of thing a child notices and a parent doesn't forget.

export const CADENCES = [
  { value: "WEEKLY", label: "Weekly", perYear: 52 },
  { value: "BIWEEKLY", label: "Every 2 weeks", perYear: 26 },
  { value: "MONTHLY", label: "Monthly", perYear: 12 },
];

export const BUCKETS = [
  { key: "SPEND", label: "Spend", icon: "ti ti-wallet", help: "Theirs to use now." },
  { key: "SAVE", label: "Save", icon: "ti ti-pig-money", help: "Set aside for something bigger." },
  { key: "GIVE", label: "Give", icon: "ti ti-heart-handshake", help: "For causes they choose." },
];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v) => Math.round(v * 100) / 100;
/** Round DOWN to the cent — matches the server's RoundingMode.DOWN on the save/give slices. */
const floor2 = (v) => Math.floor(v * 100) / 100;

/** A split is valid when each share is a non-negative whole percent and the three sum to 100. */
export function validateSplit({ spend = 0, save = 0, give = 0 } = {}) {
  const parts = [spend, save, give].map(num);
  if (parts.some((p) => p < 0 || !Number.isInteger(p))) {
    return { valid: false, error: "Each share must be a whole number, 0 or more." };
  }
  const total = parts.reduce((s, p) => s + p, 0);
  if (total !== 100) {
    return { valid: false, error: `The three shares add up to ${total}%. They need to make 100%.` };
  }
  return { valid: true, error: null };
}

/**
 * Split an allowance across the buckets, exactly as the server will.
 * Save and give round down; spend absorbs the remainder so the parts always sum to `amount`.
 */
export function splitAmounts(amount, { spend = 100, save = 0, give = 0 } = {}) {
  const total = round2(num(amount));
  if (total <= 0) return { SPEND: 0, SAVE: 0, GIVE: 0, total: 0 };
  const saveAmt = floor2((total * num(save)) / 100);
  const giveAmt = floor2((total * num(give)) / 100);
  const spendAmt = round2(total - saveAmt - giveAmt);
  // `spend` is read only for symmetry with the caller's object; the remainder defines it.
  void spend;
  return { SPEND: spendAmt, SAVE: saveAmt, GIVE: giveAmt, total };
}

/** What this allowance costs over a year — the number that makes the decision concrete. */
export function annualizedAllowance(amount, cadence = "WEEKLY") {
  const perYear = CADENCES.find((c) => c.value === cadence)?.perYear ?? 52;
  return round2(num(amount) * perYear);
}

/**
 * The next payout date for a cadence.
 *  - WEEKLY / BIWEEKLY: `day` is an ISO weekday (1 = Monday … 7 = Sunday).
 *  - MONTHLY:           `day` is a day of the month (clamped to 28 so every month has one).
 * Returns a Date, or null when the cadence/day can't be resolved.
 */
export function nextAllowanceDate(cadence = "WEEKLY", day = 1, from = new Date()) {
  const base = new Date(from);
  base.setHours(0, 0, 0, 0);

  if (cadence === "MONTHLY") {
    const target = Math.min(28, Math.max(1, Math.round(num(day)) || 1));
    const next = new Date(base.getFullYear(), base.getMonth(), target);
    if (next <= base) next.setMonth(next.getMonth() + 1);
    return next;
  }

  if (cadence === "WEEKLY" || cadence === "BIWEEKLY") {
    const target = Math.min(7, Math.max(1, Math.round(num(day)) || 1));
    const todayIso = base.getDay() === 0 ? 7 : base.getDay(); // JS Sunday=0 → ISO 7
    let delta = target - todayIso;
    if (delta <= 0) delta += 7;
    // BIWEEKLY still lands on the same weekday; the fortnight is a cadence for the *amount*,
    // and the next occurrence of that weekday is what a parent means by "when's the next one".
    const next = new Date(base);
    next.setDate(base.getDate() + delta);
    return next;
  }
  return null;
}

/** Bucket balances from the server, shaped for display and totalled. */
export function summarizeBalances(balances = {}) {
  const rows = BUCKETS.map((b) => ({ ...b, amount: round2(num(balances[b.key])) }));
  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  return { rows, total };
}

/**
 * A simple, honest projection of the SAVE bucket: contributions only, no interest.
 * We deliberately do NOT model a return here — this is a child's savings jar, and quoting a
 * growth rate on it would be both wrong and a promise we can't keep.
 */
export function savingsProjection(currentSave, amountPerPeriod, cadence = "WEEKLY", months = 12) {
  const perYear = CADENCES.find((c) => c.value === cadence)?.perYear ?? 52;
  const periods = Math.round((perYear * Math.max(0, num(months))) / 12);
  return {
    periods,
    contributed: round2(num(amountPerPeriod) * periods),
    projected: round2(num(currentSave) + num(amountPerPeriod) * periods),
  };
}

/** Outstanding chores + what completing them all would pay. */
export function summarizeChores(chores = []) {
  const open = (chores || []).filter((c) => !c.completedAt);
  const done = (chores || []).filter((c) => c.completedAt);
  return {
    open,
    done,
    openCount: open.length,
    openReward: round2(open.reduce((s, c) => s + num(c.rewardAmount), 0)),
    earned: round2(done.reduce((s, c) => s + num(c.rewardAmount), 0)),
  };
}

/** Age label from a birth year, when one was given. Coarse on purpose. */
export function ageLabel(birthYear, now = new Date()) {
  const y = Math.round(num(birthYear));
  if (!y || y < 1900 || y > now.getFullYear()) return null;
  const age = now.getFullYear() - y;
  return `${age} years old`;
}
