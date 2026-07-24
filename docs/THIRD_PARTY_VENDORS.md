# Third-party vendors — the complete integration register

**Last updated:** 2026-07-24

Every external system TerraVest talks to, in one place: what it does, which flag gates it, where
its mock lives, exactly which config keys switch it live, and any contractual or compliance
constraint that applies before it can be switched on.

## The pattern every integration follows

One rule, applied without exception:

> **Every third-party integration sits behind a config flag and ships with a mock fallback.**
> The default configuration of this repo runs the whole app with **zero vendor credentials**,
> and a vendor being down or unconfigured degrades one feature — it never breaks the app.

Concretely, each integration is a `*Provider` bean implementing a small interface. A router
(or Spring's `@ConditionalOnProperty`) selects the active one from a single property; an
unconfigured or failing provider falls back to the mock. Adding a vendor is "write the bean +
flip the property" — no feature code changes.

Two deliberate deviations from "mock returns realistic sample data", both documented in place:

| Integration | Deviation | Why |
|---|---|---|
| **Peer benchmark dataset** | The default provider returns **nothing at all**, not sample percentiles | "You're ahead of 68% of people like you" is a factual claim about the world. A fabricated version is a lie no badge can fix — and it would be the most screenshot-shared number in the app. |
| **Credit bureau** | The mock is realistic but is **always labelled `provider: "demo"`**, including when the live flag is on but the bureau failed | The UI's "Demo" badge renders from the server's `provider` field, so it can never claim a real score the user didn't get. |

---

## Register

### 1. Plaid — bank / card / investment aggregation
| | |
|---|---|
| **What it does** | Links bank, card, loan and brokerage accounts; pulls balances, transactions, holdings, liabilities. The backbone of nearly every screen. |
| **Service** | `account-aggregation-service` |
| **Gate** | `plaid.client-id` / `plaid.secret` — blank means unconfigured; the service starts and the app runs on whatever data already exists. |
| **Mock / stub** | No mock provider: Plaid's own **sandbox** (`plaid.env=sandbox`) is the mock, with test credentials. |
| **Config to go live** | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=production`, `PLAID_CLIENT_NAME`, `PLAID_WEBHOOK_VERIFY=true` |
| **Notes** | Access tokens are encrypted at rest with `APP_ENCRYPTION_KEY` (required in production). Production access needs a signed Plaid agreement and a completed security review. Webhook signature verification must be **on** in production (`PlaidWebhookVerifier`). The previously committed sandbox keys were rotated — never commit keys. |

### 2. Stripe — subscription billing, payments, refunds
| | |
|---|---|
| **What it does** | Charges subscriptions, processes bill-pay funding, issues refunds from the Ops portal. |
| **Service** | `payment-service` |
| **Gate** | `payment.provider` — `mock` (default) / `stripe` |
| **Mock / stub** | `payment/provider/MockPaymentProvider.java`, `payment/provider/MockRefundProvider.java` |
| **Live impl** | `payment/provider/StripePaymentProvider.java`, `payment/provider/StripeRefundProvider.java` |
| **Config to go live** | `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BASE_URL` |
| **Notes** | Webhook signatures are verified with a replay-tolerance window (`StripeWebhookVerifier`, `stripe.webhook.tolerance-seconds`). PCI scope is minimised by never handling raw card data — Stripe hosts the payment surface. Plans/prices live in `subscription_plan` DB rows, so a price change is config, not a deploy. |

### 3. SendGrid — transactional email
| | |
|---|---|
| **What it does** | OTP codes, invites, invoices, alerts, weekly digests. |
| **Service** | `notification-service` |
| **Gate** | `comms.provider.email` — `mock` (default) / `sendgrid` |
| **Mock / stub** | `comms/provider/MockEmailProvider.java` (logs and returns a synthetic `providerRef`) |
| **Live impl** | `comms/provider/SendGridEmailProvider.java` |
| **Config to go live** | `COMMS_PROVIDER_EMAIL=sendgrid`, `SENDGRID_API_KEY`, `SENDGRID_FROM` |
| **⚠️ Blocked on** | **Domain authentication for `terravest.app` is PENDING at SendGrid.** Sending works, but until the domain is authenticated, deliverability is poor and OTP email is not trustworthy for production. Re-test (expect HTTP 202) and only then flip `OTP_EXPOSE_DEV_CODE=false`. |

### 4. Twilio — SMS
| | |
|---|---|
| **What it does** | SMS OTP for MFA and phone verification; SMS notifications where the user opted in. |
| **Service** | `notification-service` |
| **Gate** | `comms.provider.sms` — `mock` (default) / `twilio` |
| **Mock / stub** | `comms/provider/MockSmsProvider.java` |
| **Live impl** | `comms/provider/TwilioSmsProvider.java` |
| **Config to go live** | `COMMS_PROVIDER_SMS=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| **Notes** | US A2P 10DLC brand + campaign registration is required before Twilio will deliver application-to-person SMS at volume. SMS is opt-in per user and only sent to verified numbers. |

### 5. Firebase Cloud Messaging — push notifications
| | |
|---|---|
| **What it does** | The engagement engine: bill due, unusual charge, goal hit, tax estimate ready, allowance due. |
| **Service** | `notification-service` |
| **Gate** | `comms.provider.push` — `mock` (default) / `fcm` |
| **Mock / stub** | `comms/provider/MockPushProvider.java` |
| **Live impl** | `comms/provider/FcmPushProvider.java` |
| **Config to go live** | `COMMS_PROVIDER_PUSH=fcm`, `FCM_SERVER_KEY` |
| **Notes** | Push is **opt-in per user** (`pushEnabled`, default false) and only sent to registered device tokens, so switching the provider on cannot surprise anyone. Web push additionally needs a VAPID key (`/push/config`); `pushClient.js` refuses with a clear message when it isn't configured. **Known debt:** this uses FCM's legacy `/fcm/send` server-key endpoint, which Google is phasing out — the follow-up is the HTTP v1 API with an OAuth2 service-account token. The provider returns FAILED rather than a false "sent" when unconfigured. |

### 6. Credit bureau — credit score & monitoring  *(backlog B2 — this pass)*
| | |
|---|---|
| **What it does** | FICO-scale score, 12-month history, utilisation, weighted factor breakdown, change timeline. |
| **Service** | `account-aggregation-service` (`/api/v1/aggregation/credit/**`) |
| **Gate** | `credit.provider` — `demo` (default) / `http`. Client-side: `FLAGS.CREDIT_MONITORING` (feature visible at all) and `FLAGS.CREDIT_MONITORING_LIVE` (call the backend vs. use the client demo). |
| **Mock / stub** | `credit/DemoCreditBureauProvider.java` → `credit/CreditService.java` (deterministic, seeded per user id). Client mirror: `apps/web/src/utils/creditMonitoring.js` → `demoCreditProfile()`. |
| **Live impl** | `credit/HttpCreditBureauProvider.java`, selected by `credit/CreditBureauRouter.java` |
| **Config to go live** | `CREDIT_PROVIDER=http`, `CREDIT_BUREAU_BASE_URL`, `CREDIT_BUREAU_PROFILE_PATH`, then **one** auth method: `CREDIT_BUREAU_API_KEY` (+ `CREDIT_BUREAU_API_KEY_HEADER`) **or** `CREDIT_BUREAU_TOKEN_URL` + `CREDIT_BUREAU_CLIENT_ID` + `CREDIT_BUREAU_CLIENT_SECRET`. Vendor field names map via `CREDIT_BUREAU_PATH_*` so switching resellers is config, not code. |
| **⚠️ Compliance** | **FCRA-regulated.** Serving a real consumer score requires (a) a signed bureau or reseller agreement, (b) a documented **permissible purpose**, and (c) consumer consent captured at enrolment. Most access is resold (Array, CRS, Experian Connect, TransUnion TruVision) — the HTTP provider is intentionally vendor-agnostic for that reason. Bureau data must not be reused for anything other than showing the consumer their own score. |
| **Fallback behaviour** | Unconfigured, unknown, or failing provider ⇒ the demo profile, still labelled `provider: "demo"`. A bureau outage degrades the honesty label, never the app, and never produces a fake "live" score. |

### 7. Peer benchmark dataset — "vs people like you"  *(backlog B1 — this pass)*
| | |
|---|---|
| **What it does** | Percentile curves for net worth, savings rate and emergency-fund months, within a coarse cohort. |
| **Service** | `financial-core-service` (`/api/v1/me/benchmarks`) |
| **Gate** | `benchmarks.provider` — `none` (default) / `file`. Server nav flag `benchmarks` (seeded FALSE). Client: `FLAGS.BENCHMARKS_LIVE`. Entitlement `individual.benchmarks` (Plus+). |
| **Mock / stub** | **Deliberately none.** `benchmarks/UnavailablePeerDatasetProvider.java` always answers "unavailable" with a reason. The page still shows the user's own real figures. |
| **Live impl** | `benchmarks/FilePeerDatasetProvider.java` — reads published aggregate percentile tables from a JSON file (schema documented in the class). |
| **Config to go live** | `BENCHMARKS_PROVIDER=file`, `BENCHMARKS_DATASET_PATH=/path/to/percentiles.json`, `BENCHMARKS_MIN_COHORT` (default 100) |
| **⚠️ Compliance / product rule** | **No data-broker monetization — this is a stated product guardrail, not a preference.** Acceptable sources: (a) public/licensed aggregate tables, e.g. the Federal Reserve **Survey of Consumer Finances** percentile tables; (b) our own users' data aggregated under a k-anonymity floor **with separate explicit consent to contribute** (consenting to *see* a comparison is not consenting to *be in* one, and `benchmark_consent` only records the former). Purchasing individual-level consumer records is out of bounds. |
| **Guardrails in code** | Opt-in required before anything is computed; cohorts below `benchmarks.min-cohort` are suppressed with an explicit reason; nothing is interpolated when the dataset can't answer. Pinned by `BenchmarkServiceTest`. |

### 8. Anthropic (Claude) / Google (Gemini) / OpenAI (ChatGPT) — AI assistant & insights
| | |
|---|---|
| **What it does** | The AI Assistant chat and the generated insights feed. |
| **Service** | `ai-insights-service` |
| **Gate** | `ai.provider` — `mock` (default) / `anthropic` / `gemini` (insights path). The **chat** path uses `provider/ModelRouter.java`, which owns all three clients at once and picks per turn; a model with no API key simply reports itself unconfigured. |
| **Mock / stub** | `provider/MockAiProvider.java` — deterministic, offline, no network calls. It is also the router's final fallback, so chat never hard-fails. |
| **Live impl** | `provider/AnthropicAiProvider.java` + `AnthropicClient`, `GeminiAiProvider` + `GeminiClient`, `OpenAiClient` |
| **Config to go live** | `AI_PROVIDER=anthropic\|gemini`, plus any of `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` (each enables that model in the router). Tunables: `AI_MODEL`, `*_MAX_TOKENS`, `AI_ROUTER_COOLDOWN_MS`. |
| **Priority AI** *(backlog B4 — this pass)* | `ai.priority.enabled` (default true), `ai.priority.enforce` (default true; set false for local dev with no payment-service). Entitlement `individual.priorityAi` (Premium/Business), checked by `provider/PriorityEntitlementClient.java` against `payment.uri`. A priority turn ranks models on reasoning strength alone — **same prompts, same guardrails, same data**. The entitlement check **fails open to standard routing**: billing trouble must degrade the answer, never break the assistant. |
| **Notes** | Money figures shown to users are computed by our own math, never by a model — see `utils/recommendations.js`. Every reply carries the educational disclaimer (`SystemPrompts.DISCLAIMER`). A PII-free financial summary is what gets sent to the model. Cost scales per turn, which is why Priority AI is a paid tier. |

### 9. RentCast — property valuation
| | |
|---|---|
| **What it does** | Estimated market value for a rental/primary property. |
| **Service** | `real-estate-service` |
| **Gate** | `realestate.provider` — `mock` (default) / `rentcast` |
| **Mock / stub** | `property/MockPropertyValuationProvider.java` |
| **Live impl** | `property/RentcastPropertyValuationProvider.java` |
| **Config to go live** | `REALESTATE_PROVIDER=rentcast`, `RENTCAST_API_KEY`, `RENTCAST_BASE_URL` |
| **Notes** | Valuations are estimates and are rendered with a disclaimer. Metered API — cache/refresh policy matters to cost. |

### 10. QuickBooks Online (Intuit) — business financials
| | |
|---|---|
| **What it does** | Pulls P&L, balance sheet, invoices and transactions for a connected business. |
| **Service** | `business-financials-service` |
| **Gate** | `business.provider` — `mock` (default) / `qbo` |
| **Mock / stub** | `business/provider/MockBusinessDataProvider.java` |
| **Live impl** | `business/provider/QuickBooksBusinessDataProvider.java` |
| **Config to go live** | `BUSINESS_PROVIDER=qbo`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_AUTHORIZE_URL`, `QBO_TOKEN_URL`, `QBO_API_BASE_URL` |
| **Notes** | Three-legged OAuth; refresh tokens are stored per user (`qbo_oauth_tokens`). Production keys require an Intuit app review. |

### 11. NASBA CPAVerify — CPA licence verification
| | |
|---|---|
| **What it does** | Confirms a CPA's licence is real and current before they appear in the marketplace. |
| **Service** | `financial-core-service` |
| **Gate** | `cpa.verify.provider` — `mock` (default, deterministic format check) / `nasba` |
| **Mock / stub** | `cpa/verify/LicenseVerifier.java` (mock branch) |
| **Config to go live** | `CPA_VERIFY_PROVIDER=nasba`, `CPA_VERIFY_NASBA_BASE_URL`, `CPA_VERIFY_NASBA_API_KEY` |
| **Notes** | A failed live call degrades to the mock format check rather than blocking a listing. |

### 12. AWS Textract — tax document OCR
| | |
|---|---|
| **What it does** | Extracts W-2 / 1099 / 1098 fields for the tax estimator, including scans. |
| **Service** | `financial-core-service` |
| **Gate** | `tax.ocr.provider` — `mock` (default, regex over extracted text) / `textract` |
| **Mock / stub** | `tax/ocr/TaxDocumentParser.java` (deterministic text parsing) |
| **Config to go live** | `TAX_OCR_PROVIDER=textract`, `TAX_OCR_TEXTRACT_REGION`, plus AWS credentials via the standard SDK chain (env or IAM role) |
| **Notes** | The Textract client is only constructed when selected. **Documents are parsed in memory and never stored.** A failed Textract call degrades to the text parser. Tax documents are highly sensitive — check the AWS BAA/DPA position before enabling. |

### 13. Google Cloud Storage — file/object storage
| | |
|---|---|
| **What it does** | Stores uploaded documents, business files and property images. |
| **Services** | `documents-service`, `business-financials-service`, `real-estate-service` |
| **Gate** | `storage.provider` — `none` (default, DB/local) / `gcs` |
| **Config to go live** | `STORAGE_PROVIDER=gcs`, `GCS_BUCKET`, plus GCP credentials via the standard ADC chain |
| **Notes** | Documents can be shared externally with a CPA via view-only expiring links with a passcode and an access log — the storage layer is not the access-control layer. |

### 14. Google Cloud KMS — master key for the secret store
| | |
|---|---|
| **What it does** | Wraps the master key that encrypts every stored integration secret. |
| **Service** | `secrets-service` |
| **Gate** | `secrets.provider` — `local` (default) / `gcpkms` |
| **Mock / stub** | `crypto/LocalMasterKeyProvider.java` |
| **Live impl** | `crypto/GcpKmsMasterKeyProvider.java` |
| **Config to go live** | `SECRETS_PROVIDER=gcpkms` + the KMS key resource name, plus GCP credentials |
| **⚠️ Operational** | Secrets are **KMS-store only** — a fresh database empties `secretsdb`, and auth-service will not boot without `APP_ENCRYPTION_KEY`. After any fresh-DB start, re-run `deploy/seed-secrets.sh`. |

### 15. Google Sign-In — social login
| | |
|---|---|
| **What it does** | "Continue with Google" on the auth screen. |
| **Service** | `auth-service` (`auth/GoogleTokenVerifier.java`) |
| **Gate** | Client ID configured or not; absent ⇒ the button is not offered. |
| **Config to go live** | `GOOGLE_CLIENT_ID` (must match the web client id used by the SPA) |
| **Notes** | The ID token is verified server-side — never trusted from the client. |

### 16. MaxMind GeoLite2 — login-history geolocation
| | |
|---|---|
| **What it does** | Adds an approximate city/country to Security-tab login history. |
| **Service** | `auth-service` / `audit-service` |
| **Gate** | `geoip.enabled` — `false` (default) |
| **Mock / stub** | Disabled ⇒ login history simply omits location. No fabricated location is ever shown. |
| **Config to go live** | `GEOIP_ENABLED=true`, `GEOIP_DB_PATH=/path/to/GeoLite2-City.mmdb` |
| **Notes** | Fully **offline** — the `.mmdb` file is read locally, so no IP is sent to a third party. GeoLite2 requires a (free) MaxMind account and carries its own licence terms. |

---

## Quick reference — every provider switch

| Property | Default | Live value(s) | Feature |
|---|---|---|---|
| `payment.provider` | `mock` | `stripe` | Billing, refunds |
| `comms.provider.email` | `mock` | `sendgrid` | Email |
| `comms.provider.sms` | `mock` | `twilio` | SMS |
| `comms.provider.push` | `mock` | `fcm` | Push |
| `comms.provider.inapp` | `inapp` | — | In-app notifications |
| `credit.provider` | `demo` | `http` | Credit monitoring |
| `benchmarks.provider` | `none` | `file` | Peer benchmarking |
| `ai.provider` | `mock` | `anthropic`, `gemini` | AI insights |
| `ai.priority.enabled` | `true` | — | Priority AI (entitlement-gated) |
| `realestate.provider` | `mock` | `rentcast` | Property valuation |
| `business.provider` | `mock` | `qbo` | Business financials |
| `cpa.verify.provider` | `mock` | `nasba` | CPA licence checks |
| `tax.ocr.provider` | `mock` | `textract` | Tax document OCR |
| `storage.provider` | `none` | `gcs` | File storage |
| `secrets.provider` | `local` | `gcpkms` | Secret store master key |
| `geoip.enabled` | `false` | `true` | Login-history location |
| `family.allowance.reminder.enabled` | `false` | `true` | Allowance reminders (uses the push toggle above) |

## Client-side runtime flags

Set via `VITE_FLAG_<NAME>=1` at build time, or `localStorage.tv_flag_<name> = "1"` at runtime
(the runtime override wins, so QA can flip a flag without a rebuild). All default **off**.
See `apps/web/src/config/featureFlags.js`.

| Flag | Effect |
|---|---|
| `credit_monitoring` | Show the Credit Score feature at all |
| `credit_monitoring_live` | Call the bureau endpoint instead of the client demo profile |
| `benchmarks` | Show Benchmarks in the bundled fallback nav |
| `benchmarks_live` | Fetch peer percentiles (off ⇒ own figures only — **not** sample data) |
| `family_mode` | Show Family in the bundled fallback nav |
| `priority_ai` | Offer the Priority toggle in the assistant (the entitlement still grants it) |

Server-side nav visibility for cross-platform features is a `feature_flag` row in
`platform-config-service` (`benchmarks`, `family_mode` — both seeded FALSE). Flipping one row
turns a feature on for web, iOS and Android at once.

## Standing rules

1. **Never commit a credential.** Every key is `${ENV_VAR:}` with an empty default. Secrets live
   in the KMS-backed secret store; `deploy/seed-secrets.sh` populates it.
2. **A vendor outage degrades one feature.** Every provider has a fallback path and a test that
   pins it.
3. **Never fabricate a factual claim about the world.** Demo data that shows a user what a screen
   does is fine and is labelled. Demo data that asserts something about other people, a bureau,
   or a market is not — see the peer-dataset entry.
4. **Subscriptions are the business model.** No selling or brokering of user data, in any form.
   This is what makes bank-linking trust possible, so it is a constraint on the product, not a
   marketing line.
