# Phase 8 — Mobile App (React Native) ⏳

**Goal:** Native iOS/Android app reusing the existing backend (gateway + services). See the
detailed plan in [`../../mobile-conversion-plan.md`](../../mobile-conversion-plan.md).

## Setup
- [ ] Scaffold `finance-mvp/apps/mobile` (Expo or bare React Native, TypeScript).
- [ ] Shared API layer mirroring `apps/web/src/api.js` (same gateway base URL, JWT in secure store).
- [ ] Port the TerraVest design tokens to RN (theme object: colors, spacing, radius, typography).

## Screens (parity with web)
- [ ] Auth/Login, Home (KPIs + net-worth chart), Accounts (grouped), Transactions (filterable),
      Plan (budget/debt), Invest, Real Estate, Bill Pay, AI Assistant, Profile/Settings.
- [ ] Plaid Link via `react-native-plaid-link-sdk`.
- [ ] Charts via `react-native-svg` / a RN chart lib.

## Platform
- [ ] Secure token storage (Keychain/Keystore), biometric unlock.
- [ ] Push notifications wired to Phase 7 (FCM/APNs).
- [ ] EAS/build pipeline; TestFlight + Play internal testing.

## Acceptance criteria
- [ ] Login → link account (Plaid) → see accounts/transactions/net worth on a device/simulator.
- [ ] Visual parity with the web design system.
