# TerraVest → One Cross-Platform App (Web + iOS + Android)

This doc contains:
1. **The approaches** (all possible ways) + recommendation.
2. **The copy-paste prompt** to hand an engineering agent (Claude Code) to do the conversion.
3. **Communication provider options** (SMS / email / push / in-app).
4. **Deployment paths** for shipping one app to all platforms.

---

## 1. All possible ways to go cross-platform

| Approach | One codebase → | Reuses current React? | Native feel | Effort | Best when |
|---|---|---|---|---|---|
| **Expo + React Native Web** ⭐ | iOS, Android, Web | Yes (rewrite UI to RN primitives) | True native on mobile | Medium | You want one real codebase + native mobile + web, OTA updates. **Matches your existing RN scaffold.** |
| **Capacitor** (wrap the Vite web app) | iOS, Android, Web | Yes (reuse web app almost as-is) | WebView (good, not native) | Low | Fastest path; keep the current web app, ship to stores quickly. |
| **Flutter** | iOS, Android, Web, desktop | No (full rewrite in Dart) | Excellent | High | Greenfield; willing to leave the React ecosystem. |
| **PWA only** | Web (installable) | Yes | Limited (esp. iOS) | Very low | No app-store requirement; web-first. |
| **Native per platform** (Swift + Kotlin + React web) | — | No | Best | Very high (3×) | Huge budget, platform-specific UX is critical. |

**Recommendation:** **Expo + React Native Web** in a monorepo. It gives you genuinely native iOS/Android, a web build from the same components, over-the-air updates (EAS Update) for config/content changes, and it builds on the React knowledge already in the repo.
**Fast alternative:** **Capacitor** if you want to keep the existing Vite web app verbatim and just ship it to stores now — you can migrate to Expo later.

---

## 2. THE PROMPT (copy everything in the box)

> Paste this into Claude Code (or your agent) at the repo root. Swap the one decision line if you prefer Capacitor.

```
ROLE
You are a senior cross-platform architect. Convert the existing "TerraVest" wealth-management
app into ONE configurable, scalable application that runs on Web, iOS, and Android from a single
codebase, then make every feature, disclaimer, and communication channel configurable from
config/DB WITHOUT code changes. Keep the existing Java/Spring Boot microservice backend; add
small config/content services where noted.

EXISTING CONTEXT (do not break)
- Web: React 18 + Vite at finance-mvp/apps/web. Single design system in
  src/styles/terravest-theme.css with light/dark/glass themes; fonts Fraunces (display) + DM Sans;
  brand colors forest green (#1A4D3B) + gold (#C9973A); Tabler icons.
- Backend: API gateway (8080) + 8 Spring Boot services (auth, account-aggregation/Plaid,
  financial-core, real-estate, business-financials, ai-insights, payments, notifications).
  Phases 3–7 run behind provider interfaces with mock implementations; JWT shared across services.
- A React Native (Expo) scaffold already exists at finance-mvp/mobile.
- Features to support (all already in web): Home dashboard, Accounts, Transactions, Budgets,
  Pay Bills, Debt Lab, Investments, My Business, AI Assistant, Properties, Deal Room,
  Fractional LLC, Security, Messages, Settings, Profile, Learn, How-to Guide, UI Flow Map.

TARGET ARCHITECTURE
1. Convert to a MONOREPO using pnpm workspaces + Turborepo (or Nx). Layout:
   apps/
     mobile/        # Expo (React Native) entry — iOS + Android
     web/           # Expo web (React Native Web) entry  [DECISION: use Expo RN Web]
   packages/
     ui/            # cross-platform component library (Button, Card, Input, Sheet, Table,
                    #   Icon, Disclaimer, EmptyState, etc.) built on RN primitives + RN Web
     tokens/        # design tokens (color/spacing/typography/radii/shadows) as TS/JSON,
                    #   the single source of truth; generate web CSS vars AND RN theme objects
     features/      # one folder per feature MODULE (self-contained, see "FEATURE MODULES")
     core/          # api client, auth, secure storage, remote-config client, i18n,
                    #   analytics, error boundary, navigation helpers
     config/        # the feature registry + flag schema + default config
   Shared TypeScript everywhere. Use Expo Router (file-based) so the SAME routes work on web + native.
   If "Capacitor" is chosen instead: keep finance-mvp/apps/web (Vite) as the single UI, add
   Capacitor iOS/Android shells, and implement the same config/module/disclaimer/comms layers below.

2. DESIGN SYSTEM — cross-platform, themeable, responsive
   - Move all current CSS-variable values from terravest-theme.css into packages/tokens as data.
   - Build a <ThemeProvider> that loads the active theme (light/dark/glass + future themes) from
     remote config, with a local fallback; expose hooks useTheme()/useTokens() for both platforms.
   - All components in packages/ui consume tokens (NO hard-coded colors/sizes). Provide responsive
     primitives (breakpoints on web, density on mobile). Match the existing TerraVest look exactly.
   - Keep Fraunces + DM Sans (load via expo-font on native, @font-face on web). Tabler icons via a
     cross-platform <Icon name> wrapper.

3. FEATURE MODULES — add/remove/update WITHOUT code changes
   - Every feature is a self-contained module under packages/features/<name> exporting a manifest:
       { id, title, icon, route, section, permissions, requiredFlags, component,
         widgets?: [reusable pieces], order, platforms: ['web','ios','android'] }
   - A central MODULE REGISTRY composes navigation, routes, and dashboards from manifests.
   - Which modules are enabled/ordered/sectioned comes from a REMOTE CONFIG (config service / DB),
     resolved at runtime with feature flags + a local default. Disabling a module in config removes
     it from nav/routes everywhere; reordering is config-only. Support per-user / per-cohort / per-
     platform / per-environment targeting and kill-switches. Modules lazy-load.
   - Reusability: expose feature "widgets" (e.g., NetWorthCard, UpcomingBills, InsightCard) that can
     be placed on multiple screens via config (a dashboard layout described in config, not code).

4. REMOTE CONFIG + FEATURE FLAGS
   - Add a lightweight Spring Boot "platform-config-service" (or extend an existing one) exposing:
       GET /api/v1/config/app        -> { theme, enabledModules[], dashboardLayout, ... }
       GET /api/v1/config/flags      -> feature flags (with targeting)
   - Client: a typed RemoteConfig provider with cache + offline fallback + ETag/refresh.
   - Optionally support a managed flag provider (LaunchDarkly / Unleash / Flagsmith / GrowthBook)
     behind the same interface.

5. DISCLAIMERS — fully generic, editable by non-engineers
   - Store disclaimers in DB/CMS: { key, version, locale, title, bodyMarkdown, channel, effectiveAt,
     requiresAcceptance }. Serve via GET /api/v1/content/disclaimers?keys=...&locale=...
   - A single <Disclaimer id="..."/> component renders the current version from the API (markdown),
     with skeleton + fallback. NO disclaimer text in code anywhere.
   - Track user acceptance/consent (key+version+timestamp) where requiresAcceptance is true.
   - Same mechanism powers legal copy, footnotes, "not investment advice", risk notices, etc.
     Editing in DB/CMS updates the app live (and OTA on native) — no redeploy.

6. COMMUNICATIONS — generic SMS / Email / Push / In-app
   - Backend: define a Channel provider interface (send(message, recipient, templateId, vars, locale))
     with pluggable adapters selected by config. Templates live in DB:
       { key, channel, locale, subject?, body, variables[], version, enabled }
   - A NotificationOrchestrator chooses channel(s) by event + user preferences + consent + locale,
     renders the template, and dispatches via the configured provider. Retries, idempotency,
     delivery logs, rate limits, quiet hours, unsubscribe/opt-in.
   - Make provider, templates, routing rules, and disclaimers all DB/config-driven (no code changes
     to swap Twilio↔SNS, SendGrid↔SES, FCM↔OneSignal, or to edit a template).
   - Client: register device push tokens (Expo Notifications), in-app inbox (existing Messages),
     and a notification-preferences screen bound to the backend.

7. CROSS-CUTTING
   - i18n via the same content/config service (all user-facing strings keyed; locale switch).
   - Auth: JWT from existing auth-service; secure token storage (expo-secure-store / Keychain /
     Keystore on native, httpOnly-ish handling on web). Biometric unlock on mobile (optional flag).
   - Offline: cache config, content, last-known data; graceful degradation.
   - Accessibility (a11y) on both platforms; respect reduced-motion; dynamic type.
   - Analytics + error reporting (Sentry) behind an interface, toggled by config.
   - Security: no secrets in client; certificate pinning option; PII handling; audit logging
     server-side; webhook signature verification for providers.

8. DEPLOYMENT — one app, all platforms
   - Mobile: EAS Build + EAS Submit (App Store + Google Play); EAS Update for OTA JS/config/content
     pushes without store review. Channels for dev/staging/prod.
   - Web: build the Expo web target; deploy to your host (Vercel/Netlify/S3+CloudFront/Nginx).
   - One CI/CD pipeline (GitHub Actions) building web + native, running tests, and promoting via
     environments. Versioning + release notes. Document store-submission steps.

DELIVERABLES
- The monorepo with apps/ + packages/ as above, building successfully for web, iOS, Android.
- All listed features ported to packages/features with manifests + registry-driven nav/routes.
- packages/tokens + ThemeProvider matching the current TerraVest design (light/dark/glass).
- platform-config-service (flags + app config) and content endpoints (disclaimers + templates + i18n),
  with DB schema + seed data + admin notes (how legal/ops edit content without code).
- Generic communications layer with at least one working adapter per channel + DB templates.
- CI/CD config, EAS config, and a DEPLOYMENT.md.
- Tests: unit (components, registry, config resolution), integration (config/disclaimer/comms),
  and smoke e2e per platform. A short MIGRATION.md mapping old web screens → new modules.

CONSTRAINTS & STYLE
- Do not hard-code feature lists, disclaimer text, copy, theme values, or provider choices in UI code
  — everything comes from tokens/config/content.
- Keep modules small, composable, and reusable; a widget used on Home must be reusable on any screen
  via config.
- Preserve the existing visual identity and UX exactly; this is a platform/architecture change,
  not a redesign.
- Work in small, verifiable steps: scaffold monorepo → tokens/ui → registry+config → port 1 feature
  end-to-end on all 3 platforms → then the rest → comms/disclaimers → CI/CD. Build after each step.

ACCEPTANCE CRITERIA
- The same codebase produces a working web app, iOS app, and Android app.
- Toggling a flag/config (no redeploy) adds/removes/reorders a feature in nav + routes on all
  platforms; an OTA update reflects it on installed mobile apps.
- Editing a disclaimer or a communication template in DB/CMS changes the app with no code change.
- Switching an SMS/email/push provider is a config change, not a code change.
- Theme (light/dark/glass) is config-driven and consistent across platforms.
```

---

## 3. Communication provider options (all behind one interface)

- **SMS:** Twilio · AWS SNS · Amazon Pinpoint · Vonage (Nexmo) · MessageBird/Bird · Plivo · Sinch · Telnyx
- **Email:** SendGrid · AWS SES · Mailgun · Postmark · Resend · SparkPost
- **Push:** Expo Push (wraps FCM+APNs) · Firebase Cloud Messaging (Android/Web) · APNs (iOS) · OneSignal · AWS SNS/Pinpoint · Airship
- **In-app / realtime:** WebSocket/SSE (DIY) · Pusher · Ably · GetStream
- **Managed feature flags / remote config (optional):** LaunchDarkly · Unleash · Flagsmith · GrowthBook · Firebase Remote Config
- **Content/CMS for disclaimers & copy (optional):** Strapi · Sanity · Contentful · or a simple DB table + admin screen

Pick a default per channel; the interface lets you swap or run several via config/routing rules.

---

## 4. Deployment paths (one app → all platforms)

- **iOS / Android:** Expo **EAS Build** → **EAS Submit** to App Store & Google Play. Use **EAS Update**
  for over-the-air JS/config/content releases (no store review for those).
- **Web:** Expo web export → Vercel / Netlify / S3+CloudFront / your Nginx.
- **Backend:** keep the Spring Boot services; containerize (Docker), deploy to your infra
  (Phase 9 hardening); the config/content services sit alongside.
- **CI/CD:** one GitHub Actions pipeline: install → typecheck/test → build web + EAS builds →
  deploy web + submit mobile → promote per environment (dev/staging/prod).
