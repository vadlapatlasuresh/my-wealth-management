// Bank / institution brand marks — the single source of truth for showing a recognizable
// logo beside a linked account or an income figure (reference IMG_1736: "Bank of America" mark
// next to $10,513).
//
// Plaid institution logo BYTES aren't stored in this app, and a strict CSP blocks fetching
// remote logo images, so we render a branded MONOGRAM: the institution's real brand color as a
// rounded chip with its initials. Major US institutions get their actual brand hue so the mark
// reads as "that's my bank" at a glance; anything else gets a stable, deterministic color.
// If an account ever carries a base64 `logo`/`institutionLogo`, callers can prefer that.
//
// Pure, no React — safe to import from any page/component. Colors are brand facts (not themeable
// UI), which is why the values live here and not in the theme layer.

// name-keyword → { bg brand color, fg text color, mark short initials }.
const BRANDS = [
  [/bank of america|bofa|bankamerica/, { bg: "#E31837", fg: "#FFFFFF", mark: "BofA" }],
  [/chase|jpmorgan|j\.?p\.? morgan/, { bg: "#117ACA", fg: "#FFFFFF", mark: "CH" }],
  [/wells ?fargo/, { bg: "#D71E28", fg: "#FFD400", mark: "WF" }],
  [/citi(bank|group)?/, { bg: "#056DAE", fg: "#FFFFFF", mark: "citi" }],
  [/capital ?one/, { bg: "#004977", fg: "#D03027", mark: "C1" }],
  [/american express|amex/, { bg: "#006FCF", fg: "#FFFFFF", mark: "AX" }],
  [/discover/, { bg: "#FF6000", fg: "#FFFFFF", mark: "DI" }],
  [/us ?bank|u\.s\. ?bank/, { bg: "#0C2074", fg: "#E4002B", mark: "US" }],
  [/pnc/, { bg: "#F58025", fg: "#20487B", mark: "PNC" }],
  [/truist|bb&t|suntrust/, { bg: "#2D1A45", fg: "#8BD3E6", mark: "TR" }],
  [/td ?bank|toronto.?dominion/, { bg: "#54B948", fg: "#FFFFFF", mark: "TD" }],
  [/ally/, { bg: "#6C1D45", fg: "#FFFFFF", mark: "AL" }],
  [/charles ?schwab|schwab/, { bg: "#00A0DF", fg: "#0033A0", mark: "SC" }],
  [/fidelity/, { bg: "#00754A", fg: "#FFFFFF", mark: "FI" }],
  [/vanguard/, { bg: "#96151D", fg: "#FFFFFF", mark: "VG" }],
  [/rocket ?mortgage|quicken ?loans/, { bg: "#E01A2B", fg: "#FFFFFF", mark: "RM" }],
  [/digital ?federal|dcu/, { bg: "#00838F", fg: "#FFFFFF", mark: "DCU" }],
  [/navy ?federal|nfcu/, { bg: "#003057", fg: "#FFC72C", mark: "NF" }],
  [/usaa/, { bg: "#003A63", fg: "#FFFFFF", mark: "USAA" }],
  [/sofi/, { bg: "#00B0EF", fg: "#FFFFFF", mark: "SoFi" }],
  [/chime/, { bg: "#1EC677", fg: "#FFFFFF", mark: "CM" }],
  [/marcus|goldman/, { bg: "#0B1F3A", fg: "#F2C75C", mark: "MG" }],
  [/plaid/, { bg: "#111111", fg: "#FFFFFF", mark: "PL" }],
];

// Deterministic fallback palette so an unknown institution still gets a stable brand color.
const FALLBACK = ["#3E6AE1", "#2E9E6B", "#B4552A", "#7A5BD6", "#0D8F9E", "#C0417A", "#5A6B8C"];

function initials(name) {
  const words = String(name || "").replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "$";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Brand mark for an institution name → { bg, fg, mark }. */
export function bankBrand(name) {
  const n = String(name || "").toLowerCase();
  for (const [re, brand] of BRANDS) if (re.test(n)) return brand;
  return { bg: FALLBACK[hash(n) % FALLBACK.length], fg: "#FFFFFF", mark: initials(name) };
}

/** Best institution label for an account row. */
export function accountInstitution(a = {}) {
  return a.institution || a.institutionName || a.officialName || a.name || "Account";
}

/** A base64 logo if the account/institution carries one (future-proofing); else null. */
export function accountLogoSrc(a = {}) {
  const raw = a.logo || a.institutionLogo || a.logoBase64;
  if (!raw) return null;
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
}
