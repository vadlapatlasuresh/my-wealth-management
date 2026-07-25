// Goal visuals — the single source of truth for how a goal LOOKS: a representative thumbnail
// (gradient + thematic emoji, so it renders identically in light and dark with no image
// assets to ship or break), and its on-track / at-risk / completed status.
//
// Reference: IMG_1697 (goal cards with a thumbnail, colored progress bar, status tag) and
// IMG_1719 (the predefined goal picker — fire extinguisher for Emergency fund, house for Down
// payment, flamingo float for Vacation, …). Emoji thumbnails are used instead of stock photos
// so the set is deterministic, theme-safe, and offline-proof.

// Predefined goal categories → { emoji, gradient tokens }. Gradients reference theme-safe
// pastel stops that read on both variants. Matched by keyword against the goal name/type.
const CATEGORIES = [
  { key: "emergency", emoji: "🧯", from: "#F97362", to: "#C0392B", match: /emergenc|rainy|safety ?net/ },
  { key: "down_payment", emoji: "🏡", from: "#5BB98C", to: "#1A4D3B", match: /down ?payment|house|home|property/ },
  { key: "car", emoji: "🚗", from: "#5B9BE5", to: "#1E5FAD", match: /\bcar\b|vehicle|auto|truck/ },
  { key: "vacation", emoji: "🏖️", from: "#F0C878", to: "#EE7A38", match: /vacation|travel|trip|holiday/ },
  { key: "wedding", emoji: "💍", from: "#E88FC0", to: "#C077D0", match: /wedding|marriage|engagement/ },
  { key: "education", emoji: "🎓", from: "#7C74E0", to: "#5385E0", match: /educat|tuition|school|college|course/ },
  { key: "retirement", emoji: "🏝️", from: "#5FBF8E", to: "#2D6B52", match: /retire|pension|nest ?egg/ },
  { key: "savings", emoji: "🌱", from: "#3FB577", to: "#1E7B4B", match: /saving|fund|cash|reserve/ },
  { key: "networth", emoji: "📈", from: "#3E97E8", to: "#5385E0", match: /net ?worth|wealth|invest/ },
  { key: "debt", emoji: "🏦", from: "#F0C878", to: "#C9973A", match: /pay ?off|debt|mortgage|loan/ },
  { key: "home_improve", emoji: "🛠️", from: "#EE7A38", to: "#CE8352", match: /improv|renov|remodel|furnitur|entertainment ?center/ },
  { key: "electronics", emoji: "📺", from: "#7A6FEA", to: "#6B46C1", match: /tv|electronic|gadget|computer|laptop/ },
];

const DEFAULT_CAT = { key: "custom", emoji: "🎯", from: "#3D8A68", to: "#1A4D3B" };

/** The visual identity for a goal — thumbnail emoji + gradient stops. */
export function goalVisual(goal = {}) {
  const hay = `${goal.name || ""} ${goal.goalType || ""} ${goal.category || ""}`.toLowerCase();
  const found = CATEGORIES.find((c) => c.match.test(hay));
  return found || DEFAULT_CAT;
}

/** A CSS background value for a goal thumbnail (used inline; the two stops are fixed brand-art
    colors, not themeable surfaces, so callers wrap them in a theme-guard-allow region). */
export function goalGradient(goal = {}) {
  const v = goalVisual(goal);
  return `linear-gradient(135deg, ${v.from}, ${v.to})`;
}

/**
 * Goal status → { id, label, tone } where tone maps to a status-tag color:
 *   completed → green · on_track → green · at_risk → amber/yellow · behind → red.
 * "On track vs at risk" compares progress against the time elapsed toward the target date:
 * if you're meaningfully behind the pace needed to finish on time, it's at risk.
 */
export function goalStatus(goal = {}) {
  const target = Number(goal.targetAmount || 0);
  const saved = Number(goal.savedAmount ?? goal.currentAmount ?? 0);
  const progress = target > 0 ? Math.min(1, saved / target) : Number(goal.progress) || 0;

  if (target > 0 && saved >= target) return { id: "completed", label: "Completed", tone: "green" };
  if (Number(goal.progress) >= 1) return { id: "completed", label: "Completed", tone: "green" };

  // Time-based pace check when there's a deadline.
  if (goal.targetDate) {
    const start = goal.createdAt ? new Date(goal.createdAt).getTime() : null;
    const end = new Date(goal.targetDate).getTime();
    const now = Date.now();
    if (!Number.isNaN(end)) {
      if (now >= end && progress < 1) return { id: "behind", label: "Past due", tone: "red" };
      if (start && end > start) {
        const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
        // Allow a 15% grace band before flagging.
        if (progress + 0.15 < elapsed) return { id: "at_risk", label: "At risk", tone: "amber" };
      }
    }
  }
  return { id: "on_track", label: "On track", tone: "green" };
}

export { CATEGORIES as GOAL_CATEGORIES };
