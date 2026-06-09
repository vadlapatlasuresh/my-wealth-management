# Centralized Secret Management — Design & Implementation Plan

**Status:** Implemented (v1, `apps/secrets-service`) · **Owner:** Platform · **Last updated:** 2026-06-09

> ✅ **Built & verified end-to-end** — the `secrets-service` (port 8091) implements the
> store, envelope crypto, grants, rotation, and audit described below, with placeholders
> seeded for every secret. Operational runbook: [../SECRETS_HOWTO.md](../SECRETS_HOWTO.md).
> Remaining for prod: swap `LocalMasterKeyProvider` → GCP KMS, and roll the `secrets-client`
> into each service (Phase 2). KMS anchoring (§2) is the one piece not yet wired.

Goal: stop storing API keys, encryption keys, DB credentials, and inter-service
keys in **git or plaintext `.env` files**. Move them into a centralized,
encrypted store that authorized services fetch at runtime, with access control,
rotation, and tamper-evident audit — reusing the crypto, JWT, and audit
primitives this codebase already has.

---

## 1. Goals & non-goals

**Goals**
- No secret values in git, `.env.prod`, container images, or CI logs.
- Secrets encrypted at rest with envelope encryption; a single **root key** that
  itself is never stored as a file/env value (solved via cloud identity).
- Per-service, least-privilege access ("payment-service may read `stripe.*` only").
- Runtime fetch + in-memory cache; no plaintext on disk.
- Versioning + zero-downtime rotation (especially the shared `JWT_SECRET`).
- Every read/write/rotate audited to the existing tamper-evident chain.
- Minimal blast radius and a clean migration from today's env-var model.

**Non-goals (v1)**
- Dynamic/short-lived generated secrets (Vault-style DB creds) — future phase.
- Replacing Neon's at-rest encryption or Caddy's TLS — those stay.
- Multi-region HA of the secret store — single-VM today; design leaves room.

---

## 2. The core problem: "secret zero"

A central store must decrypt secrets, so it needs a **master/root key**. If we
put that key in `.env` or git, we've just moved the problem. The only durable
answer is to anchor the root of trust in something that is **an identity, not a
stored string**:

> The VM/container proves *who it is* to a cloud KMS, and KMS performs the
> decrypt. There is no master key on disk or in env — the machine's IAM identity
> is the credential, and it cannot be copied out of a `.env` file.

This design uses **GCP KMS** as that anchor (you already deploy on a GCP VM with
a service account — see [`infra/gcp/main.tf`](../../infra/gcp/main.tf)). KMS
never releases the root key; it only decrypts small blobs (the data-encryption
keys) for callers whose IAM identity is authorized.

---

## 3. Recommended architecture

**Envelope encryption + an in-house `secrets-service`, rooted in GCP KMS.**

```
                          ┌────────────────────────────────────────────┐
                          │                GCP KMS                      │
                          │   root key "terravest-secrets-root"         │
                          │   (never leaves KMS; decrypt-only API)      │
                          └───────────────▲────────────────────────────┘
   VM service-account identity            │ Decrypt(wrappedDEK) → DEK
   (no stored secret)                     │  (only the secrets-service SA
                                          │   is granted kms.cryptoKey.decrypt)
                          ┌───────────────┴────────────────────────────┐
                          │              secrets-service                │
                          │  • envelope crypto (KMS-wrapped DEK)        │
                          │  • AES-256-GCM at rest (reuses existing     │
                          │    converter pattern)                       │
                          │  • per-service scope policies               │
                          │  • versioning + rotation                    │
                          │  • emits secret.* events → audit-service    │
                          │   Postgres: secret, secret_version,         │
                          │             secret_grant tables             │
                          └──────▲───────────────────────▲──────────────┘
                                 │  GET /internal/secrets │
   service identity (mTLS or     │  ?scope=stripe         │
   signed service-JWT)           │                        │
        ┌────────────────────────┴───┐      ┌─────────────┴───────────────┐
        │ payment-service            │      │ notification-service        │
        │ secrets client (Spring)    │ ...  │ secrets client (Spring)     │
        │ boot fetch + cache + TTL   │      │                             │
        └────────────────────────────┘      └─────────────────────────────┘
                                 │ secret.read events
                                 ▼
                          ┌──────────────────────────────┐
                          │  audit-service (hash chain)   │
                          │  POST /api/v1/audit/events     │
                          └──────────────────────────────┘
```

### Why this shape
- **Fits the existing design** — `secrets-service` is just another Spring service
  alongside `audit-service`/`platform-config-service`, with its own Neon schema
  and Flyway migrations.
- **Reuses your crypto** — the at-rest cipher is the same `AES/GCM/NoPadding`,
  12-byte IV, 128-bit tag, `Base64(IV‖ct‖tag)` format already in
  [`EncryptedStringConverter`](../../apps/auth-service/src/main/java/com/mywealthmanagement/authservice/security/EncryptedStringConverter.java)
  and `AccessTokenConverter`. The difference: the AES key is now a **KMS-wrapped
  DEK**, not a SHA-256 of an env string.
- **Reuses your audit** — secret access posts to the existing
  [`AuditChainService`](../../apps/audit-service/src/main/java/com/mywealthmanagement/auditservice/audit/AuditChainService.java).

### Build-vs-buy (decision)
| Option | Effort | Secret-zero | Fits design | Recommendation |
|---|---|---|---|---|
| **GCP Secret Manager (direct)** | Low | Solved by SA identity | OK | Best if you want least code; each service reads its own secrets by name. |
| **In-house `secrets-service` + KMS** *(this doc)* | Medium | Solved by KMS + SA | Best | Recommended — central policy, rotation, audit, one integration point. |
| **HashiCorp Vault** | High | Unseal keys | Heavy for 1 VM | Revisit only if you need dynamic secrets / multi-tenant. |

> Pragmatic path: **start with GCP Secret Manager as the backing store** behind
> the `secrets-service` API (so you don't hand-roll the KMS envelope on day one),
> then swap the backend to direct KMS envelope if/when you want full control. The
> service API and client library stay identical either way.

---

## 4. Encryption design (envelope)

Two-tier keys:

1. **Root key (KEK)** — lives in GCP KMS, symmetric, `decrypt`/`encrypt` only,
   never exported. Rotatable on a KMS schedule.
2. **Data-encryption key (DEK)** — 256-bit AES key generated by `secrets-service`.
   Stored only as a **KMS-wrapped blob** (`wrapped_dek`) in the DB. To use it, the
   service calls `KMS.Decrypt(wrapped_dek)` → plaintext DEK held in memory only.

Each secret value is encrypted as:
```
ciphertext = AES-256-GCM( key = DEK, iv = random(12), plaintext = secretValue )
stored     = Base64( iv ‖ ciphertext ‖ gcmTag )      // same layout you use today
```
- Fresh random IV per encryption (never reused).
- GCM tag authenticates the ciphertext (tamper-evident at the value level).
- Optional **per-secret DEK** for the highest-value secrets (Stripe, JWT) so one
  DEK rotation doesn't touch everything; v1 can use one active DEK per store.

**No plaintext key ever sits in env or git.** The only thing on disk is the
KMS-wrapped DEK, which is useless without KMS + the right IAM identity.

---

## 5. Data model (`secrets-service`, Neon schema `secrets`)

```sql
-- V1__secrets.sql
CREATE TABLE secret (
  id           BIGSERIAL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL UNIQUE,   -- e.g. 'stripe.secret_key'
  scope        VARCHAR(100) NOT NULL,          -- e.g. 'stripe', 'jwt', 'db.payment'
  description  VARCHAR(500),
  rotation_days INT,                           -- null = manual only
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE secret_version (
  id           BIGSERIAL PRIMARY KEY,
  secret_id    BIGINT NOT NULL REFERENCES secret(id),
  version      INT NOT NULL,                   -- 1,2,3...
  ciphertext   TEXT NOT NULL,                  -- Base64(iv‖ct‖tag)
  wrapped_dek  TEXT NOT NULL,                  -- KMS-wrapped DEK used for this version
  status       VARCHAR(20) NOT NULL,           -- ACTIVE | PREVIOUS | RETIRED
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (secret_id, version)
);

-- least-privilege: which service identity may read which scope
CREATE TABLE secret_grant (
  id            BIGSERIAL PRIMARY KEY,
  principal     VARCHAR(120) NOT NULL,         -- service id, e.g. 'payment-service'
  scope         VARCHAR(100) NOT NULL,         -- 'stripe' → may read stripe.*
  permission    VARCHAR(20)  NOT NULL,         -- READ | WRITE | ROTATE
  UNIQUE (principal, scope, permission)
);
```
`ddl-auto=validate`, Flyway owns DDL — same convention as every other service.
**The secret value is never logged, never returned in lists, never in metadata.**

---

## 6. Access control

**Principal = the calling service's identity.** Two options, in order of strength:

1. **mTLS (recommended for prod)** — each service gets a client cert (SPIFFE-style
   id in the SAN, e.g. `spiffe://terravest/payment-service`). The
   `secrets-service` maps the cert identity → `principal`. Certs are issued by a
   small internal CA; the bootstrap cert is provisioned by the same cloud-identity
   mechanism (no shared static string). Caddy already terminates public TLS;
   internal mTLS is a separate, internal-network concern.
2. **Signed service-JWT (lighter, good interim)** — replace today's static
   `X-Internal-Key` with a short-lived JWT *minted per service* (subject =
   service id, `aud = secrets-service`, 5-min expiry), signed by a dedicated
   service-auth key. This is a strict upgrade over the current shared
   [`X-Internal-Key`](../../apps/auth-service/src/main/java/com/mywealthmanagement/authservice/audit/AuditClient.java)
   string: it's scoped, expiring, and verifiable.

**Authorization** — every request resolves `principal` → consults `secret_grant`:
`payment-service` with grant `(payment-service, stripe, READ)` may
`GET /internal/secrets?scope=stripe`; a request for `scope=jwt` is `DENIED` and
audited. Default deny. Admin/rotation endpoints require an `ADMIN` role JWT
(reuse the existing roles model).

---

## 7. API surface (`secrets-service`)

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /internal/secrets?scope=<s>` | service identity + grant | Return `{name: value}` for all secrets in scope the caller may read |
| `GET /internal/secrets/{name}` | service identity + grant | Single secret (active version) |
| `POST /admin/secrets` | ADMIN JWT | Create secret + first version |
| `PUT /admin/secrets/{name}` | ADMIN JWT | Add new version (rotate) |
| `POST /admin/secrets/{name}/rotate` | ADMIN JWT | Generate/accept new version, mark old PREVIOUS |
| `DELETE /admin/secrets/{name}` | ADMIN JWT | Retire (soft delete) |
| `GET /admin/secrets` | ADMIN JWT | List **metadata only** (never values) |
| `GET /actuator/health` | none | Liveness/readiness |

Responses for reads return plaintext **only over the internal network / mTLS**,
never to the public gateway. The API gateway must **not** route `/internal/**`
or `/admin/secrets/**` publicly (it already treats `/internal/**` as internal).

---

## 8. Secret lifecycle & rotation

**Versioning:** every write creates a new `secret_version`; the newest `ACTIVE`,
the prior `PREVIOUS`, older `RETIRED`. Reads return `ACTIVE` by default but can
return `{active, previous}` for keys that need dual-validation during rotation.

**Rotation patterns:**
- **Provider API keys (Stripe, SendGrid, Plaid, Gemini, RentCast, Twilio, QBO):**
  create new key in the provider dashboard → `POST /rotate` with the new value →
  services pick it up on next cache refresh (≤ TTL) → revoke the old key in the
  provider. Zero downtime.
- **`APP_ENCRYPTION_KEY` (PII/Plaid-token AES key):** this re-encrypts data, so it
  needs **key-versioning at the data layer**. Plan: tag each encrypted column with
  the key version (prefix byte), keep `PREVIOUS` able to decrypt, run a background
  re-encrypt job, then retire. (A dedicated follow-up — see roadmap Phase 4.)
- **`JWT_SECRET` (shared across all 10 services):** today this is a single point of
  coordinated-downtime rotation. With the store, do **dual-key rotation**: publish
  `jwt.secret.active` + `jwt.secret.previous`; `JwtService.validate` accepts tokens
  signed by either, signs new tokens with `active`. Rotate `active`, wait one token
  TTL (24h), drop `previous`. No forced logout, no downtime.

**Automated rotation:** a scheduled job in `secrets-service` flags secrets whose
`rotation_days` elapsed and (for providers with rotation APIs) performs it; others
raise a `secret.rotation.due` audit event + notification.

---

## 9. Audit logging

Reuse [`audit-service`](../../apps/audit-service/src/main/java/com/mywealthmanagement/auditservice/audit/AuditController.java)
verbatim. `secrets-service` posts on every operation:

```json
{ "action": "secret.read", "actorType": "SYSTEM", "service": "secrets",
  "outcome": "SUCCESS", "metadata": "principal=payment-service;scope=stripe;name=stripe.secret_key;version=3" }
```
- Actions: `secret.read`, `secret.write`, `secret.rotate`, `secret.delete`,
  `secret.denied`, `secret.rotation.due`.
- **Never** put the secret value in `metadata` — only name/scope/version/principal.
- These land in the tamper-evident hash chain, so any deletion/edit of an access
  record is detectable via `GET /api/v1/audit/verify`.
- Add an alert: N `secret.denied` in a window, or a read of a high-value scope
  from an unexpected principal.

---

## 10. Integration with the Spring services

Ship a tiny **`secrets-client` starter** (a shared module under `packages/` or a
small jar) that every service depends on:

- On startup, before the datasource initializes, it calls
  `GET /internal/secrets?scope=<service-scopes>` and exposes the values as a
  Spring `PropertySource`, so existing `${PLAID_SECRET}` / `${jwt.secret}`
  placeholders resolve **unchanged** — minimal code churn.
- Caches in memory (never writes to disk) with a TTL (e.g. 5–15 min) and a
  `/actuator/refresh`-style hook to pull rotations without a restart.
- **Graceful fallback for local dev:** if `SECRETS_URI` is unset (dev profile),
  fall back to today's env vars / `.env.local`. So local development is unchanged;
  only prod flips to the store.

Pseudocode (Spring `EnvironmentPostProcessor`):
```java
// secrets-client
if (env.acceptsProfiles("prod")) {
  var secrets = secretsClient.fetch(scopesFor(serviceName));   // mTLS / service-JWT
  env.getPropertySources().addFirst(new MapPropertySource("vault", secrets));
}
// else: do nothing → existing ${ENV} resolution applies (dev unchanged)
```

This means **no controller/business code changes** in the 10 services — only a
dependency + a property-source shim, plus removing the secret rows from
`.env.prod`.

---

## 11. Integration with deploy & infra

- **GCP:** add to [`infra/gcp/main.tf`](../../infra/gcp/main.tf):
  a KMS keyring + `crypto_key` (`terravest-secrets-root`), a dedicated service
  account for the VM (or workload identity), and an IAM binding granting
  `roles/cloudkms.cryptoKeyEncrypterDecrypter` **only** to that SA. (If using
  Secret Manager backend: `roles/secretmanager.secretAccessor` instead.)
- **docker-compose.prod.yml:** add the `secrets-service`; give services
  `SECRETS_URI=http://secrets-service:8080` and (interim) a per-service signing
  identity. **Remove** the provider/JWT/encryption secret rows from `.env.prod` —
  what remains there is only non-secret config (domains, provider toggles, image
  tags) + the *one* bootstrap that lets the VM reach KMS, which is the SA identity
  (a metadata credential, not a file value).
- **`.env.prod` after migration:** contains *no* API keys, *no* `JWT_SECRET`, *no*
  `APP_ENCRYPTION_KEY`, *no* DB passwords. Those move into the store, seeded once
  by an admin via `POST /admin/secrets` (over mTLS, from an operator session).
- **CI:** never needs prod secrets; images are built secret-free and pull config
  at runtime.

---

## 12. Threat model (what this stops)

| Threat | Before | After |
|---|---|---|
| Secret committed to git | Common risk (`.env.local` was briefly untracked) | No secrets in repo at all |
| `.env.prod` read on the VM | Full compromise of every key | File has no secrets; attacker still needs the SA identity *and* KMS access *and* a grant |
| One leaked key → lateral movement | Shared `JWT_SECRET`/internal key = broad | Per-scope grants; dual-key JWT; short-lived service tokens |
| Tampering with access records | n/a | Hash-chained audit, `verify` endpoint |
| Stolen DB backup | Encryption keys derived from env string | Ciphertext only; DEK is KMS-wrapped, useless without KMS |

Residual risks to note: the `secrets-service` itself is now high-value (defense:
minimal surface, mTLS, no public route, alerting); a compromised VM with live SA
identity can still ask KMS to decrypt (defense: scope KMS perms to the SA only,
short cache TTL, anomaly alerts, consider per-secret grants + rate limits).

---

## 13. Implementation roadmap (phased, each shippable)

**Phase 0 — Foundations (no behavior change)**
1. Decide backend: **Secret Manager-backed** (fast) vs **KMS-envelope** (full).
2. Terraform: KMS keyring/key (or Secret Manager) + VM service account + IAM.
3. Scaffold `secrets-service` (copy structure from `audit-service`): Neon schema,
   Flyway `V1__secrets.sql`, security config, health.

**Phase 1 — Store + admin API**
4. Implement envelope crypto (reuse the GCM converter; key = KMS-unwrapped DEK).
5. `POST/PUT/rotate/list` admin endpoints (ADMIN JWT). Seed current secrets once.
6. Wire `secret.*` audit events into the existing chain.

**Phase 2 — Service integration (read path)**
7. Build `secrets-client` starter (boot fetch + cache + dev fallback).
8. Roll out to **one** low-risk service first (e.g. `ai-insights-service`:
   `GEMINI_API_KEY`), verify, then the rest. Remove those rows from `.env.prod`.

**Phase 3 — Harden access**
9. Replace static `X-Internal-Key` with signed short-lived service-JWTs, then mTLS.
10. Enforce `secret_grant` least-privilege; default deny; denied-access alerts.

**Phase 4 — Rotation**
11. Dual-key `JWT_SECRET` rotation in `JwtService` (accept active+previous).
12. Versioned `APP_ENCRYPTION_KEY` + background re-encrypt job for PII/Plaid tokens.
13. Scheduled rotation + `rotation.due` alerts; document runbooks.

**Phase 5 — Cleanup**
14. Confirm `.env.prod` holds zero secrets; rotate every key that ever touched git.
15. Add a CI check that fails if a known-secret pattern appears in tracked files.

---

## 14. Quick win available now (independent of the full build)
Even before the service exists, you can stop secrets touching git today by using
**GCP Secret Manager directly**: store each key there, grant the VM SA
`secretAccessor`, and have `deploy.sh` materialize a tmpfs (RAM-only) `.env.prod`
at deploy time via `gcloud secrets versions access`. That removes secrets from
git and the persistent disk immediately, and is forward-compatible with the
`secrets-service` API above. This is the recommended **first step**.

---

## Appendix — current secret inventory to migrate
`JWT_SECRET`, `APP_ENCRYPTION_KEY`, `AUDIT_INGEST_KEY`, `NOTIFICATIONS_INTERNAL_KEY`,
per-service `DATABASE_URL/USER/PASSWORD`, `PLAID_CLIENT_ID/SECRET`,
`STRIPE_SECRET_KEY/WEBHOOK_SECRET`, `SENDGRID_API_KEY`, `TWILIO_*`, `FCM_SERVER_KEY`,
`QBO_CLIENT_ID/SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
`REALESTATE_PROVIDER_API_KEY`. (Full mapping with source files in the platform
audit that accompanied this design.)
