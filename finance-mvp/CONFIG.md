# Configuration — one common place, fully env-driven

**Nothing is configured in code.** Every integration, key, URL, and feature toggle
is read from an environment variable, so switching environments or turning a real
provider on/off is a config change only — never a code change.

## The two config places

| Environment | Single source of config | Secrets |
|---|---|---|
| **Dev / E2E** | `.env.example` → copy to `.env.local` | inline (mocks need none) |
| **Prod** | `.env.prod.example` → copy to `.env.prod` (on the VM) | encrypted **secrets-service** (set via `deploy/rotate-secret.sh`) |

The web app reads only `VITE_API_BASE` at build time; everything else it needs
(which OAuth providers are on, etc.) it fetches from the backend at runtime — so a
backend env change is enough, no web rebuild.

## End-to-end testing in dev with NO keys

Leave every `*_PROVIDER` on its `mock` default and every key blank. The whole stack
runs on deterministic mocks:

- email / SMS / push → **logged, not sent**
- Plaid / AI / Stripe / RentCast / QuickBooks → **fixtures**
- OTP codes → returned in the API response (`OTP_EXPOSE_DEV_CODE=true`) so login/MFA
  work without an email/SMS provider

```bash
cp .env.example .env.local      # tweak nothing for an all-mock run
bash deploy/start-local.sh      # brings the stack up on Postgres
```

## Flip ONE integration to real (same pattern for all)

Set the provider flag **and** its key(s), then restart that service. Examples:

| Integration | Toggle | Keys | Service |
|---|---|---|---|
| Email | `COMMS_PROVIDER_EMAIL=sendgrid` | `SENDGRID_API_KEY`, `SENDGRID_FROM` | notification |
| SMS | `COMMS_PROVIDER_SMS=twilio` | `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM` | notification |
| Push | `COMMS_PROVIDER_PUSH=fcm` | `FCM_SERVER_KEY` | notification |
| Bank linking | (always real) | `PLAID_CLIENT_ID/SECRET`, `PLAID_ENV` | account-aggregation |
| AI | `AI_PROVIDER=anthropic` | `ANTHROPIC_API_KEY` | ai-insights |
| Payments | `PAYMENT_PROVIDER=stripe` | `STRIPE_SECRET_KEY/WEBHOOK_SECRET` | payment |
| Real estate | `REALESTATE_PROVIDER=rentcast` | `REALESTATE_PROVIDER_API_KEY` | real-estate |
| Business | `BUSINESS_PROVIDER=quickbooks` | `QBO_CLIENT_ID/SECRET` | business |
| Social login | (auto-on when keyed) | `GOOGLE_OAUTH_CLIENT_ID` / `APPLE_OAUTH_CLIENT_ID` | auth |

**Prod:** put the secret in the store, not in `.env.prod`:
`bash deploy/rotate-secret.sh <name>` (prompts hidden), then recreate the consuming
service. `deploy/seed-secrets.sh` lists the name↔env mapping.

## Security gate before real users

`OTP_EXPOSE_DEV_CODE=false` **once a real email/SMS provider is verified and
delivering** — otherwise codes reach no one. See `.env.prod.example` for the note.
