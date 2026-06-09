# TerraVest — End-to-End Test Scenarios

Comprehensive flow-test catalog for the TerraVest wealth-management platform
(11 Spring Boot services behind an API gateway + React/Vite web app).

- **Last verified:** 2026-06-08 — full new-user journey green on local Postgres stack.
- **How to run the automated happy-path:** `bash deploy/smoke-test.sh`
- **Base URL (local):** Web `http://localhost:5173` · API gateway `http://localhost:8080`
- **Auth model:** JWT (HS256, 24h). Login is two-step when `mfa.enabled=true` (default):
  `POST /login` → OTP delivered → `POST /mfa/verify` → JWT.

## Status legend

| Mark | Meaning |
|------|---------|
| ✅ | Verified working end-to-end (real or sandbox provider) |
| 🟡 | Works, but backed by a **mock/unconfigured** provider locally (no real external call) |
| ⛔ | Pending / not implemented / cannot be exercised locally |

## Integration status (local `.env.local`)

| Capability | Provider | Local status | Toggle |
|------------|----------|--------------|--------|
| Bank linking / transactions | Plaid | ✅ **sandbox** (live API) | `PLAID_*`, `PLAID_ENV` |
| Email OTP / notifications | SendGrid | ✅ **live** | `COMMS_PROVIDER_EMAIL=sendgrid`, `SENDGRID_*` |
| AI insights / chat | Google Gemini | ✅ **live** | `AI_PROVIDER=gemini`, `GEMINI_*` |
| SMS OTP | Twilio | 🟡 mock (logs code, returns `devCode`) | `COMMS_PROVIDER_SMS=twilio`, `TWILIO_*` |
| Bill pay / subscriptions | Stripe/ACH | 🟡 mock | `STRIPE_*` |
| Real-estate valuation | RentCast | 🟡 mock/resilient fallback | `RENTCAST_API_KEY` |
| Business sync | QuickBooks (QBO) | 🟡 mock | `QBO_*` |
| Push | FCM | 🟡 mock | `COMMS_PROVIDER_PUSH=fcm`, `FCM_*` |

> **Dev convenience:** `otp.expose-dev-code=true` returns the OTP as `devCode` in the
> login/verify response so flows are testable without reading an inbox. **Must be `false` in prod.**

---

## 1. Onboarding & Authentication (auth-service :8081)

> **Signup is full-KYC.** The web register form requires: first/last name, **verified
> email** (inline OTP), password, **verified phone** (inline OTP), date of birth, full
> address, and SSN (individual) or business name + EIN (business). Registration
> auto-logs-in. Returning-user login is two-step (password → emailed MFA code), and the
> web UI **fully supports it** (`api.verifyMfa` + a code-entry view). Both flows are
> covered by `apps/web/tests/e2e/onboarding.spec.js` (both passing).

### 1.1 Happy path — KYC signup → dashboard, and returning MFA login ✅
| # | Step | Expect |
|---|------|--------|
| 1 | `POST /api/v1/auth/register` `{email,password(≥8),firstName,accountType,mfaChannel}` | `200`, `token`, `message:"User registered successfully"` (auto-login) |
| 2 | `POST /api/v1/auth/login` `{email,password}` | `200`, `mfaRequired:true`, `channel:"EMAIL"`, masked `destination`, `devCode` (dev) |
| 3 | A real email arrives at the address (EMAIL channel) | Code matches `devCode`; subject "Your TerraVest verification code" |
| 4 | `POST /api/v1/auth/mfa/verify` `{email,code}` | `200`, `token`, `message:"Login successful"` |
| 5 | `GET /api/v1/auth/me` with `Authorization: Bearer <token>` | `200`, profile with **SSN/EIN masked** |
| 6 | Web `loadAll()` fans out to snapshot/accounts/transactions/insights/payments/real-estate | All `200`; dashboard renders |

### 1.2 Registration edge cases
| # | Scenario | Expect | Status |
|---|----------|--------|--------|
| a | Duplicate email | `409`, "User with this email already exists" | ✅ |
| b | Password < 8 chars | `400` validation error | ✅ |
| c | Invalid email format | `400` | ✅ |
| d | `accountType=BUSINESS` + `ein` | `identityVerified=true`; EIN encrypted, only last-4 stored | ✅ |
| e | `accountType=INDIVIDUAL` + `ssn` | `identityVerified=true`; SSN encrypted, last-4 stored | ✅ |
| f | No SSN/EIN | `identityVerified=false` | ✅ |
| g | Password strength meter feedback (web) | Weak/medium/strong shown before submit | ✅ |

### 1.3 Login / MFA edge cases
| # | Scenario | Expect | Status |
|---|----------|--------|--------|
| a | Wrong password | `401` "Invalid credentials"; audit `auth.login.failure` | ✅ |
| b | Wrong MFA code | `401` "Invalid or expired code" | ✅ |
| c | Expired MFA code (>5 min) | `401`; code rejected | ✅ |
| d | Reused MFA code (second verify) | `401` (code consumed on first success) | ✅ |
| e | `mfaChannel=SMS` login | `channel:"SMS"`, masked phone; code logged only (mock) | 🟡 |
| f | `mfa.enabled=false` | `/login` returns token directly, no second step | ✅ |
| g | OTP store lost on auth-service restart (in-memory) | Pending codes invalidated → user re-logs in | ✅ (by design) |

### 1.4 Email & phone verification
| # | Step | Expect | Status |
|---|------|--------|--------|
| a | `POST /api/v1/auth/email/send {email}` | `200`, real email sent, `devCode` (dev) | ✅ |
| b | `POST /api/v1/auth/email/verify {email,code}` | `{verified:true}`; `emailVerified=true` | ✅ |
| c | `POST /api/v1/auth/sms/send {phone}` (≥10 digits) | `200`, `devCode`; SMS mock-logged | 🟡 |
| d | `POST /api/v1/auth/sms/verify {phone,code}` | `{verified:true}` | 🟡 |
| e | Invalid email/phone format | `400` | ✅ |

### 1.5 Profile management
| # | Step | Expect | Status |
|---|------|--------|--------|
| a | `GET /api/v1/auth/me` | `200`, SSN/EIN masked, password never present | ✅ |
| b | `PUT /api/v1/auth/me` (name/phone/address/mfaChannel) | `200`, only non-null fields updated; **email/SSN/EIN immutable here** | ✅ |
| c | `DELETE /api/v1/auth/me` | `204`; `UserDataPurgeClient` purges downstream services; audit `account.delete` retained | ⛔ verify downstream purge per service |
| d | `GET /api/v1/auth/validate?token=` | valid/invalid string | ✅ |

### 1.6 Authorization guards (cross-cutting)
| # | Scenario | Expect | Status |
|---|----------|--------|--------|
| a | Any protected endpoint, **no token** | `401`/`403` | ✅ |
| b | Garbage/expired JWT | `401`/`403`, no stack trace leak (GlobalExceptionHandler) | ✅ |
| c | `USER` role hits `/api/v1/support/**` | `403` | ✅ |
| d | `USER` role hits `/api/v1/audit/stats` | `403` | ✅ |
| e | Every request carries a correlation id (`X-Request-Id`) end-to-end | id in gateway → service logs & audit | ✅ |

---

## 2. Account Aggregation — Plaid (account-aggregation-service :8082)

| # | Step | Expect | Status |
|---|------|--------|--------|
| 2.1 | `POST /api/v1/aggregation/link-token/create` | `200`, `{link_token:"link-sandbox-…"}` | ✅ sandbox |
| 2.2 | Web opens Plaid Link modal with token, user picks `user_good`/`pass_good` | `public_token` returned to client | ⛔ requires Plaid Link UI (browser) |
| 2.3 | `POST /api/v1/aggregation/public-token/exchange {publicToken}` | `200`; access token encrypted in `PlaidItem`; accounts + initial txns saved | ⛔ needs a real public_token from 2.2 |
| 2.4 | `GET /api/v1/aggregation/accounts` | `200`, `List<AccountDto>` (empty until linked) | ✅ |
| 2.5 | `GET /api/v1/aggregation/transactions` | `200`, list (empty until linked) | ✅ |
| 2.6 | `POST /api/v1/aggregation/transactions/sync` | incremental pull via stored cursor (`V2` migration) | ⛔ needs linked item |
| 2.7 | `PATCH /api/v1/aggregation/transactions/{id}/category` | `200`, category updated | ⛔ needs txns |
| 2.8 | Plaid webhook → auto-sync | not reachable from localhost | ⛔ prod-only |

> **Note:** 2.2–2.3 need the browser Plaid Link flow (sandbox creds `user_good`/`pass_good`, MFA `1234`). The token-create half is automatable; the exchange half needs the UI.

---

## 3. Financial Core (financial-core-service :8083)

| # | Step | Expect | Status |
|---|------|--------|--------|
| 3.1 | `GET /api/v1/me/snapshot?range=All` | `200`, net-worth snapshot (total, 30-day change, components) | ✅ |
| 3.2 | `GET /api/v1/planning/goals` / `POST` / `PUT /{id}` / `DELETE /{id}` | CRUD `200` | ✅ (create verified) |
| 3.3 | `GET/PUT /api/v1/planning/budgets/{month}` | budget lines, overspend flags | ✅ |
| 3.4 | `POST /api/v1/planning/debt-scenarios` (AVALANCHE/SNOWBALL/HYBRID) | payoff projection | 🟡 mock data |
| 3.5 | `GET/POST /api/v1/invest/brokers`, `/{id}/sync`, `DELETE` | broker accounts CRUD | ✅ list; 🟡 sync mock |
| 3.6 | `GET/POST /api/v1/invest/alts` | alternative investments | ✅ |
| 3.7 | `POST /api/v1/me/export` | GDPR/CCPA data export | ⛔ verify payload completeness |

---

## 4. Real Estate (real-estate-service :8084)

| # | Step | Expect | Status |
|---|------|--------|--------|
| 4.1 | `POST /api/v1/real-estate` (address, price, type) | `200`, property created | ✅ |
| 4.2 | `GET /api/v1/real-estate` / `GET /{id}` | list / detail | ✅ |
| 4.3 | `PUT /{id}` / `DELETE /{id}` | update / delete | ✅ |
| 4.4 | `POST /api/v1/real-estate/lookup` (address) | valuation estimate | 🟡 RentCast mock/resilient fallback |
| 4.5 | `POST /api/v1/real-estate/{id}/revalue` | refreshed valuation | 🟡 same |
| 4.6 | `GET /api/v1/deals/marketplace?filters` | browse deals | ✅ |
| 4.7 | `GET /api/v1/deals/{id}` (+ sponsor track record) | deal detail | ✅ |
| 4.8 | `POST /api/v1/deals/{id}/watch` / `DELETE` | watchlist toggle | ✅ |
| 4.9 | `POST /api/v1/deals/{id}/interests` | express interest | ✅ |
| 4.10 | `GET /api/v1/deals/{id}/documents` (PPM, agreements) | document list | ⛔ verify; e-sign not implemented |
| 4.11 | `/api/v1/sponsor/**` track-record management | sponsor CRUD | ⛔ verify role/ownership rules |

---

## 5. Business Financials (business-financials-service :8085)

| # | Step | Expect | Status |
|---|------|--------|--------|
| 5.1 | `GET /api/v1/business/dashboard` | key metrics | ✅ |
| 5.2 | `GET /api/v1/business/pnl?period=MTD\|QTD\|YTD` | P&L | ✅ |
| 5.3 | `GET /api/v1/business/invoices` / `/expenses` | lists | ✅ |
| 5.4 | `GET/POST /api/v1/business/manual/businesses` | manual entity CRUD | ✅ |
| 5.5 | `GET /api/v1/business/connection` / `POST /connect` (QuickBooks OAuth) | QBO link status / initiate | 🟡 mock (no QBO keys) |

---

## 6. AI Insights (ai-insights-service :8086)

| # | Step | Expect | Status |
|---|------|--------|--------|
| 6.1 | `GET /api/v1/ai/insights` | `200`, 3–5 personalized insights | ✅ Gemini |
| 6.2 | `POST /api/v1/ai/insights/refresh` | regenerated insights | ✅ |
| 6.3 | `POST /api/v1/ai/chat {message,history}` | `200`, `{reply}` with educational disclaimer | ✅ Gemini |
| 6.4 | Chat with empty `GEMINI_API_KEY` | falls back to mock/canned reply | 🟡 fallback |

---

## 7. Payments (payment-service :8087)

| # | Step | Expect | Status |
|---|------|--------|--------|
| 7.1 | `GET /api/v1/payments/bill-pay-intents` | history list | ✅ |
| 7.2 | `POST /api/v1/payments/bill-pay-intents` (+ idempotency key) | intent created (PENDING) | 🟡 mock; no real ACH |
| 7.3 | `POST /api/v1/payments/bill-pay-intents/{id}/cancel` | cancel pending | 🟡 |
| 7.4 | Duplicate idempotency key | same intent returned, no double-charge | ⛔ verify |
| 7.5 | Stripe webhook → state machine (PENDING→SUBMITTED→SETTLED/FAILED) | status transitions | ⛔ prod-only / mock |

---

## 8. Notifications (notification-service :8088)

| # | Step | Expect | Status |
|---|------|--------|--------|
| 8.1 | `GET /api/v1/notifications` (paginated) | list, unread badge | ✅ |
| 8.2 | `POST /api/v1/notifications/test` | in-app notification created | ✅ |
| 8.3 | `POST /api/v1/notifications/{id}/read` | marked read | ✅ |
| 8.4 | `GET/PUT /api/v1/notifications/preferences` | email/push/summary/alerts toggles | ✅ |
| 8.5 | `POST /internal/comms/otp` (X-Internal-Key) | EMAIL→SendGrid `SENT`; SMS→mock | ✅ email / 🟡 sms |
| 8.6 | Quiet hours (`22-7`) defer push/SMS; email/in-app immediate | deferral honored | ⛔ verify |

---

## 9. Audit & Customer Care (audit-service :8090 + auth-service support)

| # | Step | Expect | Status |
|---|------|--------|--------|
| 9.1 | Every gateway request → audit event (fire-and-forget) | userId, path, status, latency recorded | ✅ |
| 9.2 | `GET /api/v1/audit/me?size=N` | signed-in user's own activity | ✅ |
| 9.3 | `GET /api/v1/audit/stats?days=30` (ADMIN/CARE) | KPI dashboard | ✅ (role-gated) |
| 9.4 | `GET /api/v1/audit/verify` (ops) | tamper-evident hash-chain integrity | ⛔ verify |
| 9.5 | `GET /api/v1/support/users?query=` (CARE/ADMIN) | member search | ✅ (SupportFlowTests) |
| 9.6 | `GET /api/v1/support/users/{id}` | 360 view: profile + activity + issues | ✅ |
| 9.7 | `POST /api/v1/support/users/{id}/roles` (ADMIN only) | grant/revoke role; audited | ✅ |
| 9.8 | CARE agent tries role grant | `403` (ADMIN-only) | ✅ |

---

## 10. Platform Config (platform-config-service :8089)

| # | Step | Expect | Status |
|---|------|--------|--------|
| 10.1 | `GET /api/v1/content/disclaimers` | disclaimer content (markdown body) | ✅ (recent `body_markdown` fix) |
| 10.2 | `GET /api/v1/config/**` feature flags / remote config | flags resolved | ⛔ verify |

---

## 11. Cross-cutting / non-functional

| # | Scenario | Expect | Status |
|---|----------|--------|--------|
| 11.1 | CORS: browser at `localhost:5173` → gateway | single `Access-Control-Allow-Origin`, no dup header | ✅ |
| 11.2 | JWT expiry (24h) → protected call | `401`; web emits `auth:unauthorized` → logout/redirect | ✅ |
| 11.3 | Downstream service down → gateway route | graceful `502/503`, no crash | ⛔ verify per route |
| 11.4 | Service restart with Postgres | data persists (not H2) | ✅ |
| 11.5 | PII at rest (SSN/EIN) | AES-256-GCM encrypted; `APP_ENCRYPTION_KEY` set in prod | 🟡 dev uses insecure fallback key |
| 11.6 | Secrets never in API responses | no password/full SSN/raw tokens leaked | ✅ |
| 11.7 | Mobile (Capacitor) API base resolves | Android emulator → `10.0.2.2:8080` | ⛔ verify on device |

---

## 12. Pending scenarios / known gaps (prioritized)

**Cannot be fully exercised locally (need browser UI or prod infra):**
1. **Plaid account-link completion** (§2.2–2.3, 2.6–2.8) — needs the Plaid Link modal + webhooks.
2. **Payment settlement** (§7.4–7.5) — real Stripe/ACH + webhook state machine; mock only locally.
3. **QuickBooks sync** (§5.5) — OAuth + real QBO data.
4. **Push notifications & quiet hours** (§8.6) — FCM not configured.

**Implemented but unverified — recommend explicit tests:**
5. **Account deletion downstream purge** (§1.5c) — confirm each service honors `DELETE /internal/users/{id}`.
6. **GDPR export completeness** (§3.7) and **audit hash-chain verify** (§9.4).
7. **Payment idempotency** (§7.4) — duplicate key must not double-create.
8. **Deal-room documents / e-sign** (§4.10) and **sponsor track record rules** (§4.11).
9. **Service-down resilience** per gateway route (§11.3).

**Provider-mocked locally (work, but not real external calls):**
10. SMS OTP (Twilio), real-estate valuation (RentCast), debt planner data, broker sync.

**Test infrastructure (now in place):**
11. Automated coverage: `deploy/smoke-test.sh` (API happy-path, 26 assertions),
    `apps/web/tests/e2e/onboarding.spec.js` (Playwright — KYC signup + returning MFA login,
    both passing), plus unit tests and `SupportFlowTests` (backend integration). **Not yet
    automated in CI** — wiring a job (start stack → run smoke + e2e) is the next step, and
    extending Playwright to cover Plaid-link / deal-room / payment screens.

---

## Appendix — quickest manual demo path

1. Open `http://localhost:5173` → **Sign up** (use a real email to receive the code).
2. Enter the emailed 6-digit code.
3. Dashboard loads (net worth, accounts, insights).
4. **Link accounts** → Plaid sandbox → `user_good` / `pass_good` / MFA `1234`.
5. Add a property, create a goal, open AI assistant, browse Deal Room.
6. Admin/ops portal at `/admin` requires a `CARE`/`ADMIN` role (grant via
   `SUPPORT_BOOTSTRAP_EMAIL` or `POST /api/v1/support/users/{id}/roles` as an admin).
