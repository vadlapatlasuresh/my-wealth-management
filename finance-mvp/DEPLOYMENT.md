# TerraVest — Deployment & Operations

Monorepo at `finance-mvp/`. Web UI in `apps/web` (Vite + React). Backend is a
set of Spring Boot services under `apps/*`, fronted by an API gateway. The
**mobile apps are the same web UI wrapped with Capacitor** — no separate native
UI codebase.

---

## 1. Port map

| Service | Port |
| --- | --- |
| api-gateway | 8080 |
| auth-service | 8081 |
| account-aggregation-service | 8082 |
| financial-core-service | 8083 |
| real-estate-service | 8084 |
| business-financials-service | 8085 |
| ai-insights-service | 8086 |
| payment-service | 8087 |
| notification-service | 8088 |
| platform-config-service | 8089 |
| web (Vite dev) | 5173 |

The web app talks **only to the gateway** (`VITE_API_BASE`, default
`http://localhost:8080`); the gateway routes to the services above.

---

## 2. Run locally

### Prerequisites
- Node 20+, npm
- JDK 17 (Temurin), Maven
- In dev, services run on H2 in-memory; most provider keys are optional (mock
  used if blank — see `.env.cross-platform.example`).

### Environment
```bash
cp .env.cross-platform.example .env          # fill what you need (or leave blank for mocks)
cp .env.cross-platform.example apps/web/.env  # Vite reads VITE_* here
```

### Start the backend (gateway + all services)
```bash
npm run start:backend
```
This boots the gateway, all Spring services, and the legacy Node API together.
To run one service at a time, use its script, e.g.:
```bash
npm run start:api-gateway
npm run start:auth-service
# ...one per service
```

### Start the web app
```bash
npm run dev:web        # Vite dev server on http://localhost:5173
```

---

## 3. Build the web app
```bash
npm run build -w apps/web    # outputs apps/web/dist (this is Capacitor's webDir)
```

---

## 4. Wrap with Capacitor (iOS / Android)

Config lives in `apps/web/capacitor.config.ts`
(`appId: com.terravest.app`, `appName: TerraVest`, `webDir: dist`).

```bash
# one-time install (from apps/web)
npm i -D @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "TerraVest" "com.terravest.app" --web-dir=dist   # already configured

# build + add native projects (one-time)
npm run build -w apps/web
npx cap add ios
npx cap add android

# every time the web build changes
npm run build -w apps/web
npx cap sync

# open native IDEs to build / sign / run
npx cap open ios       # Xcode
npx cap open android   # Android Studio
```

**Live reload** during development: uncomment the `server` block in
`capacitor.config.ts`, set `url` to your machine's LAN IP running
`npm run dev:web`, then `npx cap sync` and run on device. Re-comment and rebuild
before any release build.

### Native plugin → feature matrix
| Feature | Plugin | Backend / notes |
| --- | --- | --- |
| Push notifications | `@capacitor/push-notifications` | notification-service; needs FCM/APNS keys |
| Token / session storage | `@capacitor/preferences` (or a secure-storage plugin) | stores JWT issued by auth-service |
| Biometric unlock (optional) | e.g. `capacitor-native-biometric` | gate app open / re-auth |
| Maps / address autocomplete | web Google Places (already in web UI) | `VITE_GOOGLE_MAPS_API_KEY` |

Install each plugin, then `npx cap sync`.

---

## 5. OTA / content updates

Two layers of "update without an app-store release":

1. **Content / config (always live, no rebuild):** navigation order &
   enablement, disclaimers, and comms templates are served from the backend
   (platform-config-service DB + content API + notification templates). Legal/ops
   edit these in the DB and bump a version — clients pick up the change on next
   fetch. See `MIGRATION.md` for the tables and version-bump pattern.

2. **Web bundle OTA (optional, future):** because the app is a web bundle inside
   Capacitor, the JS/CSS can be hot-swapped without a store submission using a
   live-update mechanism (e.g. Capacitor Live Updates / a self-hosted bundle
   server). Native-code changes (new plugins, permissions) still require a store
   release. Until a live-update channel is wired up, ship web changes via a new
   build + `cap sync` + store release.

---

## 6. Provider-swap matrix (which env var swaps which provider)

| Capability | Provider selector / keys | Behavior when blank |
| --- | --- | --- |
| Bank linking | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | Mock data |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Mock |
| SMS | `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM` **or** `AWS_SNS_*` | Mock logs |
| Email | `SENDGRID_API_KEY` **or** `AWS_SES_*` | Mock logs |
| Push | `FCM_SERVER_KEY` + `APNS_*` (or `EXPO_ACCESS_TOKEN`) | Mock logs |
| AI insights | `AI_PROVIDER` (`mock`/`anthropic`/`openai`) + matching key | Mock |
| Feature flags | `LAUNCHDARKLY_SDK_KEY` | Local/DB flags |
| CMS content | `CMS_API_URL`, `CMS_API_TOKEN` | DB content API |
| Web API base | `VITE_API_BASE` | localhost gateway |
| Maps | `VITE_GOOGLE_MAPS_API_KEY` | Manual address entry |

Switching SMS/email providers is just a matter of filling one provider's keys and
leaving the other blank.

---

## 7. Placeholders to fill (checklist)

All keys live in `.env.cross-platform.example` (copy to `.env` / `apps/web/.env`).

- [ ] `JWT_SECRET` — same value across **all** Java services *(required)*
- [ ] `VITE_API_BASE` — gateway URL the web/mobile app calls *(required)*
- [ ] Plaid: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`
- [ ] Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] SMS: Twilio (`TWILIO_*`) **or** AWS SNS (`AWS_SNS_*`)
- [ ] Email: `SENDGRID_API_KEY` **or** AWS SES (`AWS_SES_*`) + `EMAIL_FROM`
- [ ] Push: `FCM_SERVER_KEY`, `APNS_*` (or `EXPO_ACCESS_TOKEN`)
- [ ] AI: `AI_PROVIDER` + `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
- [ ] Flags (optional): `LAUNCHDARKLY_SDK_KEY`
- [ ] CMS (optional): `CMS_API_URL`, `CMS_API_TOKEN`
- [ ] Maps (optional): `VITE_GOOGLE_MAPS_API_KEY`
- [ ] iOS signing: `APPLE_TEAM_ID`, `IOS_DISTRIBUTION_CERT_BASE64`, `IOS_PROVISIONING_PROFILE_BASE64`, `APPLE_APP_SPECIFIC_PASSWORD`
- [ ] Android signing: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- [ ] EAS (optional): `EXPO_TOKEN`

Add signing creds as **CI secrets** to enable the `mobile` job in
`.github/workflows/ci.yml`.
