# 14 — Mobile Conversion (iOS & Android)

> **Decision of record:** TerraVest ships to mobile via **Capacitor** — the existing
> React/Vite web app under [`apps/web`](../finance-mvp/apps/web) wrapped as native
> iOS/Android apps. **Not** a React Native rewrite.
>
> This supersedes the older root-level `mobile-conversion-plan.md` (which proposed a
> React Native rewrite) and the abandoned Expo skeleton in `finance-mvp/mobile/`.

_Last updated: 2026-07-25_

---

## Why Capacitor (not a rewrite)

Our business logic is **client-side JavaScript** (KPIs, ledger merge, insights, PDF/OCR/xlsx
all compute in React). That makes the reuse math one-sided:

| Layer | Capacitor (WebView) | React Native / Flutter rewrite |
|---|---|---|
| Backend APIs (14 Java services + gateway) | **100%** reused | 100% reused |
| Client business logic (utils, insights, PDF/OCR/xlsx) | **~100%** | ~20–40% |
| UI (167 React files, theme, shared charts) | **~95%** | ~0% (full rewrite) |
| **Weighted reuse** | **~95%+** | ~30–40% |

- **Effort:** Capacitor ≈ **2–3 weeks** to first store submission vs. **3–6 months** for a rewrite.
- **Already started:** native `ios/` + `android/` projects exist and
  [`capacitor.config.ts`](../finance-mvp/apps/web/capacitor.config.ts) is committed. This plan
  finishes that track.

**Revisit only if** we later hit a WebView UX wall we can't style around.

---

## Current state (starting line)

| Item | Status |
|---|---|
| `@capacitor/{core,cli,ios,android}` v8.4 | ✅ installed ([apps/web/package.json](../finance-mvp/apps/web/package.json)) |
| Native `apps/web/ios` + `apps/web/android` | ✅ generated |
| `capacitor.config.ts` (`com.terravest.app`, `webDir: dist`, **bundled** not remote-URL) | ✅ store-safe base |
| `cap:sync` / `cap:ios` / `cap:android` npm scripts | ✅ present |
| Native plugins (push, secure storage, biometric, camera, browser) | ⬜ not installed |
| Store-compliance hardening | ⬜ pending |
| Expo skeleton `finance-mvp/mobile/` | 🗑️ to be deleted (dead end) |

---

## Phase 0 — Decide & clean up  ·  ~½ day

- [ ] Confirm Capacitor as the single mobile track.
- [ ] **Delete `finance-mvp/mobile/`** (abandoned Expo skeleton) to stop design drift.
- [ ] **Subscription billing decision (blocking):** decide IAP vs. financial-service positioning.
      We ship subscriptions (payment-service + feature gating). If mobile unlocks *digital*
      features, Apple 3.1.1 requires In-App Purchase (30/15%) and forbids linking to web
      checkout; Google Play Billing has the parallel rule. This gates store submission — decide now.

## Phase 1 — Build on device  ·  ~2–3 days

- [ ] `npm run build -w apps/web` → `npx cap sync`.
- [ ] `npx cap open ios` / `android`; configure signing; run on a **real device**.
- [ ] Smoke test: login/MFA, Plaid link, a data dashboard, PDF export, OCR upload.
- [ ] Fix WebView breakage: safe-area insets, Android hardware **back button** (`@capacitor/app`),
      keyboard overlap, status-bar styling.

## Phase 2 — Native capability + secure storage  ·  ~3–5 days

- [ ] Install plugins (see matrix below); `npx cap sync`.
- [ ] **Move JWT/refresh tokens out of `localStorage`** into secure storage.
- [ ] Wire `@capacitor/push-notifications` → **notification-service** fan-out.
- [ ] Add biometric unlock (`capacitor-native-biometric`).
- [ ] Route Plaid / bank OAuth through `@capacitor/browser` (system browser — **not** in-WebView).
- [ ] Route document capture through `@capacitor/camera` → existing OCR/Documents flow.

## Phase 3 — Store-compliance hardening  ·  ~2–4 days

- [ ] Release config: `android.allowMixedContent: false`, **no** dev `server.url`, HTTPS-only gateway.
- [ ] `OTP_EXPOSE_DEV_CODE=false` for store builds.
- [ ] Add **in-app account deletion** (Apple 5.1.1(v) / Google).
- [ ] Add **Sign in with Apple** if any third-party social login is offered (5.1.1(iv)).
- [ ] Add all `Info.plist` usage strings (camera, Face ID, photos, notifications) + Android runtime prompts.
- [ ] Fill Apple **Privacy Nutrition Labels** + Google **Data Safety** form; confirm live privacy-policy URL (see `legal/`).
- [ ] Resolve subscriptions per Phase 0 decision.

## Phase 4 — Ship  ·  ~2–3 days + review

- [ ] Icons/splash (`apps/web/scripts/generate-icons.mjs` + `sharp`), screenshots, listings.
- [ ] TestFlight + Play Internal Testing → submit.
- [ ] **Budget one Apple 4.2 rejection round**; respond with the native-feature list from Phase 2.

**Realistic total: ~2–3 weeks to first submission.**

---

## Native plugin → feature matrix

| Plugin | Feature it enables | Notes |
|---|---|---|
| `@capacitor/push-notifications` + `@capacitor/local-notifications` | Alerts | Wires to notification-service |
| `@capacitor/preferences` **+** `capacitor-secure-storage-plugin` | Token/secure storage | Never keep JWT in `localStorage` |
| `@capacitor/app` | Back button, deep links, app-state | Android back button is mandatory UX |
| `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/keyboard` | Native shell polish | Helps pass Apple 4.2 |
| `@capacitor/browser` | Plaid / OAuth flows | In-WebView OAuth is rejected by both stores |
| `capacitor-native-biometric` | Face ID / fingerprint unlock | Needs `NSFaceIDUsageDescription` |
| `@capacitor/camera` + `@capacitor/filesystem` | Document capture → OCR/upload | Needs camera/photo usage strings |
| Native Plaid bridge (fallback) | If `react-plaid-link` misbehaves in WebView | `@capacitor-community/plaid` |

**Tooling:** Xcode + Apple Developer ($99/yr), Android Studio + Play Console ($25 one-time), Fastlane/EAS for signing/CI.

---

## Store rejection red flags (ranked)

1. 🔴 **Apple 3.1.1 — In-App Purchase** for our subscriptions. Decide in Phase 0.
2. 🔴 **Apple 4.2 — "just a website wrapper."** Mitigate with real native features (Phase 2).
3. 🟠 **Account deletion required** in-app (Apple 5.1.1(v) / Google).
4. 🟠 **Cleartext / mixed content** must be off in release (`allowMixedContent`, dev `server.url`).
5. 🟠 **Sign in with Apple** required if any social login exists.
6. 🟠 **OTP dev-code exposure** must be disabled for store builds.
7. 🟡 **Privacy labels / Data Safety form** must accurately declare financial + Plaid data.
8. 🟡 **Permission usage strings** — missing strings crash-reject on iOS.
9. 🟡 **Plaid/OAuth in system browser**, never in-WebView.

---

## Commands (quick reference)

```bash
# from finance-mvp/apps/web
npm run build            # produce dist/ (webDir)
npx cap sync             # copy web build + plugins into native projects
npx cap open ios         # Xcode: build / sign / run
npx cap open android     # Android Studio
npm run ios:run          # build + sync + run on iOS
npm run android:run      # build + sync + run on Android
```
