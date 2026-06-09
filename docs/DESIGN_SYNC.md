# Keeping the design mockups in sync with the app

**Why this doc exists:** the design files are hand-authored static HTML mockups,
*separate* from the React app, so they drift whenever we ship a feature unless we
update them deliberately. This caused the gap you saw (e.g. Debt Lab had far more
features in the app than in the mockup).

## The three design files (all standalone HTML)
- `assets/terravest-redesign.html` — **web** (authenticated app shell; sidebar +
  `#page-*` screens switched by `navigate()`).
- `assets/mobile/terravest-ios.html` — **iOS** gallery (iPhone frames, HIG style).
- `assets/mobile/terravest-android.html` — **Android** gallery (Pixel frames, Material 3).

## The source of truth
`docs/SCREEN_FEATURE_INVENTORY.md` — a per-screen feature inventory **derived from
the real pages** in `finance-mvp/apps/web/src/pages/`. Treat it as the spec the
three mockups must match.

## Process — do this whenever a screen's features change
1. **Update the inventory first.** Edit the screen's section in
   `SCREEN_FEATURE_INVENTORY.md` (sections, tabs, controls, data, states) to match
   the new React code. The real page is always the authority.
2. **Update all three mockups** for that screen to match the inventory entry —
   web `#page-X`, the iOS frame, the Android frame. Reuse each file's existing
   design tokens/components; don't invent new styles.
3. **Verify** (the checks used when these were last synced):
   - HTML parses: `python3 -c "from html.parser import HTMLParser as H; H().feed(open('<file>').read())"`
   - `<div>`/`</div>` balanced; web: every nav `data-page` has a matching `#page-*`
     and a `navigate()` label; exactly one `class="page active"`.

## Fast path (bulk re-sync)
Re-run the same flow used to build this: an agent extracts the inventory from the
pages, then per-file agents update web/iOS/Android against it. See the prompts in
git history / this session. Good for large changes; for a one-screen tweak, just
edit the three frames directly.

## Definition of done for "designs are up to date"
Every screen in the app appears in all three mockups **at full feature depth**
(every tab/control/section/state from the inventory), files parse, and tags balance.
