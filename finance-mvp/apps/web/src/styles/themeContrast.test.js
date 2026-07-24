import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { THEMES } from "../theme";

/*
 * PER-THEME CONTRAST CHECK (roadmap C2 — design guardrail).
 *
 * Glass is now the universal theme with a Dark and a Light variant, and every screen is driven
 * by the same token layer. That means one careless token edit can quietly make text unreadable
 * in the variant the author wasn't looking at — the exact regression this file exists to catch.
 *
 * It parses terravest-theme.css directly (no browser, no jsdom): tokens are resolved per theme
 * with :root as the base layer, translucent surfaces are composited over the theme's canvas,
 * and each pair is checked against the WCAG 2.1 contrast ratio it actually needs:
 *
 *   body / secondary text on a card  → 4.5:1  (AA, normal text)
 *   muted text + large numbers       → 3.0:1  (AA, large text — these render ≥18.66px or bold)
 *   status + accent colours          → 3.0:1  (AA, non-text/graphical objects)
 *   text on a FILLED brand surface   → 4.5:1  (buttons and pills carry real labels)
 *
 * A failure here is a design bug, not a flaky test: fix the token, don't relax the threshold.
 */

const CSS = fs.readFileSync(
  path.join(new URL(".", import.meta.url).pathname, "terravest-theme.css"),
  "utf8"
);

/** Collect `--token: value;` declarations from every block whose selector is exactly `sel`. */
function declarationsFor(sel) {
  const out = {};
  // Match "<sel> { … }" at the start of a line. Requiring `{` immediately after the selector
  // keeps `html[data-theme="glass"] body { … }` from being mistaken for the theme's own block;
  // theme blocks contain no nested braces, so [^{}]* is a safe body.
  const re = new RegExp(`^\\s*${sel}\\s*\\{([^{}]*)\\}`, "gm");
  let m;
  while ((m = re.exec(CSS)) !== null) {
    for (const line of m[1].split("\n")) {
      const d = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
      if (d) out[d[1]] = d[2].trim();
    }
  }
  return out;
}

/**
 * Every token for a theme. `:root` is the base layer; the theme's own block overrides it.
 * Later declarations win, matching the cascade (glass-dark is re-tuned in a second block).
 */
function tokensFor(theme) {
  return { ...declarationsFor(":root"), ...declarationsFor(`html\\[data-theme="${theme}"\\]`) };
}

// ---------------------------------------------------------------- colour math

function parseColor(value, tokens, depth = 0) {
  const v = String(value).trim();
  if (depth > 5) return null; // alias cycle guard

  // var(--other, fallback) → follow the alias, then the fallback.
  const varRef = v.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/i);
  if (varRef) {
    const aliased = tokens[varRef[1]];
    if (aliased) return parseColor(aliased, tokens, depth + 1);
    return varRef[2] ? parseColor(varRef[2], tokens, depth + 1) : null;
  }

  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgba = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgba) {
    return {
      r: +rgba[1], g: +rgba[2], b: +rgba[3],
      a: rgba[4] === undefined ? 1 : +rgba[4],
    };
  }
  return null;
}

/** Composite a translucent colour over an opaque one — what the eye actually sees. */
function over(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------- the checks

/** Pairs that must hold in EVERY theme: [foreground token, surface token, min ratio, why]. */
const PAIRS = [
  ["--tv-text-primary", "--tv-card", 4.5, "body text on a card"],
  ["--tv-text-primary", "--tv-bg", 4.5, "body text on the page canvas"],
  ["--tv-text-secondary", "--tv-card", 4.5, "secondary text on a card"],
  ["--tv-text-muted", "--tv-card", 3.0, "muted labels on a card (large/secondary text)"],
  ["--tv-on-accent", "--tv-forest", 4.5, "button label on the filled brand surface"],
  ["--tv-positive", "--tv-card", 3.0, "positive figures on a card"],
  ["--tv-negative", "--tv-card", 3.0, "negative figures on a card"],
  ["--tv-warning", "--tv-card", 3.0, "warning figures on a card"],
  ["--tv-accent-cash", "--tv-card", 3.0, "cash accent on a card"],
  ["--tv-accent-invest", "--tv-card", 3.0, "investments accent on a card"],
  ["--tv-accent-bills", "--tv-card", 3.0, "bills accent on a card"],
  ["--tv-warning-deep", "--tv-card", 3.0, "aging-ramp amber on a card"],
  ["--tv-score-good", "--tv-card", 3.0, "health-score 'good' band on a card"],
];

describe("theme token contrast", () => {
  it("ships the two Glass variants the app can actually select", () => {
    // If a theme is added, it must be added to these checks too — that is the point.
    expect(THEMES).toEqual(["glass-dark", "glass"]);
  });

  for (const theme of THEMES) {
    describe(theme, () => {
      const tokens = tokensFor(theme);

      it("defines the canvas and card surfaces", () => {
        expect(parseColor(tokens["--tv-bg"], tokens)).not.toBeNull();
        expect(parseColor(tokens["--tv-card"], tokens)).not.toBeNull();
      });

      for (const [fgKey, bgKey, min, why] of PAIRS) {
        it(`${why} meets ${min}:1`, () => {
          const canvas = parseColor(tokens["--tv-bg"], tokens);
          const fgRaw = parseColor(tokens[fgKey], tokens);
          const bgRaw = parseColor(tokens[bgKey], tokens);
          // A missing token is a failure in itself: the page would fall back to a
          // hardcoded literal and stop tracking the theme.
          expect(fgRaw, `${fgKey} is not defined for ${theme}`).not.toBeNull();
          expect(bgRaw, `${bgKey} is not defined for ${theme}`).not.toBeNull();

          const surface = over(bgRaw, canvas);
          const ratio = contrast(over(fgRaw, surface), surface);
          expect(
            Number(ratio.toFixed(2)),
            `${fgKey} on ${bgKey} in ${theme} is ${ratio.toFixed(2)}:1, needs ${min}:1`
          ).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }
});
