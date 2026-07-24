// Canonical, app-wide category color palette.
//
// The design brief requires that the SAME category renders in the SAME color in
// every chart, list and legend across the whole app. This module is the single
// source of truth for that mapping. It is pure (no React, no DOM) and safe to use
// from any chart component, page, or util.
//
// Colors are tuned to be vibrant and legible on the dark glassmorphism surfaces
// (they carry enough chroma to read as distinct swatches against a translucent
// dark card) while still passing on the light theme. Hues are spread around the
// wheel so adjacent slices in a donut stay distinguishable.

// Canonical buckets → color. Order also defines a pleasing default rotation.
const CANONICAL = {
  housing:        "#F25FA8", // magenta-pink  (Housing / Rent / Mortgage)
  shopping:       "#4EA8F0", // blue
  food:           "#F5C445", // gold-yellow   (Food & Dining / Restaurants)
  groceries:      "#4FBE83", // green
  auto:           "#F0803C", // orange        (Auto & Transport / Fuel)
  utilities:      "#7A6FF0", // violet        (Utility & Bill Payments)
  medical:        "#E5675A", // coral-red     (Medical / Health)
  entertainment:  "#2CC4C4", // teal          (Entertainment / Streaming)
  travel:         "#8ED14F", // lime          (Travel & Hospitality)
  education:      "#5B8DEF", // indigo
  personal:       "#C77DD6", // orchid        (Personal Care)
  subscriptions:  "#B06FE0", // purple
  income:         "#3DDC97", // mint (positive / inflow)
  transfer:       "#6FB1D6", // steel-blue
  fees:           "#D98C5F", // clay
  misc:           "#9AAEA4", // muted sage    (Miscellaneous / Other)
  uncategorized:  "#7E8C97", // slate
};

// Extra distinct hues for unknown categories that don't map to a bucket, so two
// different unknowns still get two different (stable) colors.
const EXTRA_RING = [
  "#E8618C", "#38B6C9", "#C9A227", "#6C8CFF", "#5FBF8E",
  "#D07AB0", "#8FB33E", "#E58F4A", "#7C74E0", "#4FB0A8",
];

// Keyword → bucket. First matching keyword wins (checked against a lowercased,
// alnum-normalized category string), so "Utility & Bill Payments", "utilities"
// and "electric bill" all resolve to the same slot.
const KEYWORDS = [
  [/housing|rent|mortgage|home ?loan|property/, "housing"],
  [/grocer|supermarket/, "groceries"],
  [/food|dining|restaurant|cafe|coffee|takeout|delivery/, "food"],
  [/shop|retail|merchandise|apparel|clothing|amazon/, "shopping"],
  [/auto|transport|fuel|gas|uber|lyft|ride|parking|transit/, "auto"],
  [/util|bill ?payment|electric|water|internet|phone|mobile/, "utilities"],
  [/medic|health|pharmac|doctor|dental|clinic|hospital/, "medical"],
  [/entertain|stream|movie|music|game|netflix|spotify/, "entertainment"],
  [/travel|hospitality|hotel|flight|airline|vacation/, "travel"],
  [/educat|tuition|school|course|book|learning/, "education"],
  [/personal ?care|salon|beauty|grooming|fitness|gym/, "personal"],
  [/subscri|membership|recurring/, "subscriptions"],
  [/income|salary|payroll|deposit|refund|inflow/, "income"],
  [/transfer|payment|withdraw|atm/, "transfer"],
  [/fee|charge|interest|tax/, "fees"],
  [/misc|other|general/, "misc"],
  [/uncategor|unknown|^$/, "uncategorized"],
];

function normalize(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9 &]/g, "").trim();
}

// Deterministic hash so an unknown category always lands on the same EXTRA_RING color.
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const _cache = new Map();

/** The canonical bucket key for a category name (e.g. "auto", "misc"). */
export function categoryBucket(name) {
  const n = normalize(name);
  for (const [re, bucket] of KEYWORDS) if (re.test(n)) return bucket;
  return null; // unknown → handled by categoryColor via EXTRA_RING
}

/** Stable vibrant color for any category name. Same input → same output, app-wide. */
export function categoryColor(name) {
  const key = String(name || "uncategorized");
  if (_cache.has(key)) return _cache.get(key);
  const bucket = categoryBucket(key);
  const color = bucket ? CANONICAL[bucket] : EXTRA_RING[hash(normalize(key)) % EXTRA_RING.length];
  _cache.set(key, color);
  return color;
}

/** Build [{name, color}] legend entries for a list of category names, de-duped. */
export function categoryLegend(names = []) {
  const seen = new Set();
  const out = [];
  for (const n of names) {
    const k = String(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: k, color: categoryColor(k) });
  }
  return out;
}

export const CATEGORY_COLORS = CANONICAL;
