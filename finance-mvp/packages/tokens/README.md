# @terravest/tokens

The **single source of truth** for the TerraVest design system: brand colors,
semantic colors, surfaces, text colors, spacing, radii, typography, and shadows —
for all three themes (`light`, `dark`, `glass`).

## Source of truth, not a copy

`tokens.json` is canonical. The CSS file at
`apps/web/src/styles/terravest-theme.css` (`:root`,
`html[data-theme="dark"]`, `html[data-theme="glass"]`) is considered
**generated/kept-in-sync from these tokens** — the values here mirror it exactly
today. When a token changes, change it **here first**, then regenerate / update
the CSS variable blocks.

Note: today we intentionally do **not** auto-rewrite the web CSS at build time
(to avoid breaking the running app). The CSS variable blocks and `tokens.json`
are mirrored by hand. `cssVars()` / `cssVarsBlock()` exist so this can be
automated later, or used to diff CSS against the tokens.

## Usage

### Web (regenerate / verify CSS variables)

```js
const { cssVars, cssVarsBlock } = require('@terravest/tokens');

cssVars('light');        // { '--tv-forest': '#1A4D3B', '--radius-md': '10px', ... }
console.log(cssVarsBlock('dark')); // ready-to-paste body for html[data-theme="dark"] { ... }
```

### Native (React Native / Expo) — same JSON, no CSS

```js
import tokens, { getTheme } from '@terravest/tokens';

const theme = getTheme('light');
const styles = {
  card: {
    backgroundColor: theme.color.card,
    borderRadius: parseInt(theme.radius.md, 10), // strip "px" for RN
  },
  accent: { color: theme.color.gold }, // #C9973A
};
```

Native imports the **same `tokens.json`**, so web and native never drift.

## API

| Export | Description |
| --- | --- |
| default / `tokens` | the raw `tokens.json` object |
| `THEMES` | `['light', 'dark', 'glass']` |
| `getTheme(name)` | normalized bundle: `{ color, shadow, spacing, radius, typography }` |
| `cssVars(name)` | `{ '--tv-...': value }` CSS-variable map for a theme |
| `cssVarsBlock(name)` | the same as a printable `--var: value;` CSS block body |

## Token groups

- **color** — per theme (`light` / `dark` / `glass`):
  - brand: `forest` (#1A4D3B), `forestMid`, `forestLight`, `sage`, `sageLight`, `sagePale`
  - accent: `gold` (#C9973A), `goldLight`, `goldPale`
  - semantic: `positive`, `negative`, `warning`, `neutral` (+ `*Bg` pairs)
  - surfaces: `white`, `bg`, `card`, `border`, `borderLight`
  - text: `textPrimary`, `textSecondary`, `textMuted`, `textInverse`
- **spacing** — `sidebarW`, `xs`/`sm`/`md`/`lg`/`xl`/`2xl`
- **radius** — `sm` (6px), `md` (10px), `lg` (16px), `xl` (24px)
- **typography** — `fonts.display` (Fraunces), `fonts.body` (DM Sans), `displayWeight`, `baseFontSize`, `lineHeight`
- **shadow** — per theme: `sm` / `md` / `lg`

## How to add a theme

1. Add a new key under `color` in `tokens.json` (e.g. `"highContrast": { ... }`)
   with **every** color key the other themes have.
2. Add a matching key under `shadow` (fall back to `light` if unsure).
3. Add the theme name to `THEMES` is automatic — it derives from `color` keys
   via `getTheme`, but update the exported `THEMES` array in `index.js` for
   discoverability.
4. Web: generate the CSS block with `cssVarsBlock('highContrast')` and paste it
   into `terravest-theme.css` as `html[data-theme="highContrast"] { ... }`.
5. Native: no extra work — `getTheme('highContrast')` just works.
