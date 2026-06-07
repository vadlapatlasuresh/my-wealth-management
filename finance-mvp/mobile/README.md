# My Wealth Management — Mobile (Expo / React Native)

A standalone Expo app that reuses the **same backend** (API Gateway on :8080) and the TerraVest
design tokens. It lives outside `apps/*` on purpose so it is **not** part of the web npm
workspace (its native deps are heavy). Install and run it independently.

## Status
Phase 8 **scaffold** — a working foundation, not yet full feature-parity. What's here:
- Navigation (stack: Login ↔ Home), JWT stored in Expo SecureStore.
- Shared `src/api.js` (mirrors the web API layer; all calls via the gateway; 401/403 auto-logout).
- Ported design tokens (`src/theme.js`).
- `LoginScreen` (real auth) and `HomeScreen` (live snapshot + accounts).

## Run
```bash
cd finance-mvp/mobile
npm install
npm start        # then press i (iOS sim), a (Android), or w (web)
```
Point `app.json > expo.extra.apiBaseUrl` at your gateway. For a device/simulator, use your
machine's LAN IP instead of `localhost` (e.g. `http://192.168.1.20:8080`).

## Remaining work (see docs/phases/PHASE_8_MOBILE.md)
- Screens for Transactions, Plan, Invest, Real Estate, Bill Pay, AI Assistant, Profile.
- Plaid Link via `react-native-plaid-link-sdk`.
- Charts via `react-native-svg`.
- Push notifications (Phase 7), biometric unlock, EAS build pipeline.
