import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/*
 * RAW COLOUR LITERAL GUARDRAIL (roadmap C2 — design guardrail).
 *
 * WHY: every screen is driven by the token layer, so a bare `#3DDC97` in a page is frozen at
 * whatever theme the author had open. It looks right to them and wrong to everyone on the other
 * variant — and nothing fails, so it ships. That is how design drift actually happens here; the
 * Glass migration had to sweep dozens of these back out by hand.
 *
 * THE RULE: pages must not contain a raw colour literal. The two accepted forms are
 *
 *   var(--tv-positive)                 — the token
 *   var(--tv-positive, #3DDC97)        — the token with a literal FALLBACK (the house style)
 *
 * ESCAPE HATCH: some colour really is fixed — a brand mark, or a standalone printed document
 * with no access to the app stylesheet. Wrap it:
 *
 *   // theme-guard-allow-start: <why this colour is genuinely not themeable>
 *   …
 *   // theme-guard-allow-end
 *
 * Regions are deliberately explicit and show up in review, unlike a silent per-file waiver.
 * Two whole-file waivers exist below for pages whose CONTENT is the palette.
 */

const PAGES_DIR = new URL(".", import.meta.url).pathname;

/** Pages where colour literals are the subject matter, not styling drift. */
const FILE_WAIVERS = {
  "StyleGuidePage.jsx":
    "the palette reference — it renders the literal swatches it documents",
  "VisualizationStudioPage.jsx":
    "the in-app design studio — colours are live-editable design data, not page styling",
};

// #rgb / #rrggbb / #rrggbbaa. 4-digit (#rgba) is deliberately NOT matched: it is vanishingly
// rare in real CSS and would flag copy like the invoice placeholder "e.g. Invoice #1042".
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

// KEYWORD literals — the exact bug behind the dark-mode "white-on-white" report: a theme-
// invariant `background: 'white'` (or 'black'/opaque-white) that stays light while the theme's
// text token goes light. Matched ONLY as a CSS *value* — a style property followed by the
// quoted keyword — so prose like "Whole Foods" or "white-glove" never trips it. Genuinely
// fixed colours (a badge over a photo) go in a theme-guard-allow region like any other literal.
const STYLE_PROP = "(?:background|backgroundColor|color|borderColor|border|fill|stroke|outlineColor)";
const KEYWORD = new RegExp(
  `${STYLE_PROP}\\s*:\\s*['\"](?:white|black|rgb\\(\\s*255\\s*,\\s*255\\s*,\\s*255\\s*\\)|rgba\\(\\s*255\\s*,\\s*255\\s*,\\s*255\\s*,\\s*1\\s*\\))['\"]`,
  "gi"
);

// SCOPE NOTE — hex only, on purpose. rgba()/hsla() in these pages are overwhelmingly *alpha
// effects* rather than palette choices: drop shadows, modal scrims, and hairline tints that are
// meant to darken or lighten whatever surface they land on, and which therefore already work in
// both variants. Flagging them would bury the real signal in true-but-useless noise. Hex is
// where palette drift actually lives, and it is a precise, zero-false-positive test.
const stripVarFallbacks = (src) => {
  // Fallbacks may themselves contain a function call — var(--tv-positive-bg, rgba(61,220,151,.15))
  // — so allow one level of nested parens, and repeat to unwrap var-inside-var.
  let prev;
  // SVG fragment references — url(#fcFill), href="#gradId" — are ids, not colours, and an id
  // like "fcFill" happens to start with three hex characters.
  let out = src.replace(/url\(\s*#[\w-]+\s*\)/g, "URL").replace(/(?:xlink)?[hH]ref=(["'])#[\w-]+\1/g, "HREF");
  do {
    prev = out;
    out = out.replace(/var\(\s*--[A-Za-z0-9-]+\s*(?:,(?:[^()]|\([^()]*\))*)?\)/g, "VAR");
  } while (out !== prev);
  return out;
};

/** Lines inside an explicit theme-guard-allow region (1-indexed set). */
function waivedLines(lines) {
  const waived = new Set();
  let open = null;
  lines.forEach((line, i) => {
    if (line.includes("theme-guard-allow-start")) open = i + 1;
    if (open !== null) waived.add(i + 1);
    if (line.includes("theme-guard-allow-end")) open = null;
  });
  // An unterminated region would silently waive the rest of the file.
  expect(open, "a theme-guard-allow-start region was never closed").toBeNull();
  return waived;
}

function offendersIn(file) {
  const src = fs.readFileSync(path.join(PAGES_DIR, file), "utf8");
  const lines = src.split("\n");
  const waived = waivedLines(lines);
  const out = [];
  lines.forEach((line, i) => {
    if (waived.has(i + 1)) return;
    const stripped = stripVarFallbacks(line);
    const hits = [...(stripped.match(HEX) || []), ...(stripped.match(KEYWORD) || [])];
    if (hits.length) out.push(`${file}:${i + 1}  ${hits.join(", ")}   ${line.trim().slice(0, 100)}`);
  });
  return out;
}

const pageFiles = fs
  .readdirSync(PAGES_DIR)
  .filter((f) => f.endsWith(".jsx") && !f.endsWith(".test.jsx"))
  .sort();

describe("pages use theme tokens, not raw colour literals", () => {
  it("finds the page files to scan", () => {
    // Guards against the scan silently passing because it matched nothing.
    expect(pageFiles.length).toBeGreaterThan(30);
  });

  for (const file of pageFiles) {
    const waiver = FILE_WAIVERS[file];
    it(waiver ? `${file} (waived: ${waiver})` : file, () => {
      if (waiver) {
        // Assert the waiver is still earning its keep, so stale waivers get noticed.
        expect(offendersIn(file).length, `${file} no longer needs its waiver — remove it`)
          .toBeGreaterThan(0);
        return;
      }
      const offenders = offendersIn(file);
      expect(
        offenders,
        `Raw colour literal(s) in ${file}. Use var(--tv-token) or var(--tv-token, #fallback), ` +
          `or wrap genuinely fixed colour in a theme-guard-allow-start/end region:\n` +
          offenders.join("\n")
      ).toEqual([]);
    });
  }
});
