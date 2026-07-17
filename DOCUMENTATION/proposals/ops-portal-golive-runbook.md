# Ops Portal — Go-Live Runbook

**For:** whoever is doing the deploy · **Time:** ~20 min + DNS propagation
**Covers:** the Cloudflare change, the two env deploys, and how to know it actually worked.

The ops portal moves from `app.terravest.app/ops` to its own origin, `ops.terravest.app`. Read §0
before touching anything — one step is destructive and one is easy to get wrong.

---

## 0. Read this first

**Two things will bite you if you skip them:**

1. **The DNS record must be grey-cloud (DNS only), not Proxied.** Behind Cloudflare's orange cloud,
   the Let's Encrypt HTTP-01 challenge is answered by Cloudflare's edge and **Caddy never gets a
   certificate**. It would also route ops traffic — customer PII, SSN reveals, refunds — through a
   third party's TLS termination, which `app.terravest.app` does not do today.
2. **Migration V8 revokes every existing staff grant.** If `OPS_BOOTSTRAP_EMAIL` /
   `OPS_BOOTSTRAP_PASSWORD` aren't set before the deploy, **nobody can get into the portal** and
   you'll be creating the first account by hand in the DB.

**Order matters:** DNS first, then env, then deploy. Setting `OPS_DOMAIN` before DNS resolves makes
Caddy retry ACME noisily against a name that isn't there.

**Rollback:** blank `OPS_DOMAIN` in `.env.prod` and re-run `deploy.sh`. Caddy falls back to
`ops.localhost` (an internal cert, no ACME) and the ops site block goes inert. The member app is
untouched either way — it never had the ops bundle.

---

## 1. Cloudflare (2 minutes)

The record already exists. It just needs the proxy turned **off**.

**DNS → Records → `ops` → Edit:**

| Field | Value |
|---|---|
| Type | `A` |
| Name | `ops` |
| IPv4 | `34.139.32.148` |
| Proxy status | **DNS only** (grey cloud) ← **this is the change** |
| TTL | Auto |

Nothing else in Cloudflare changes. No SSL-mode change, no page rules, no Origin Certificate —
Caddy handles TLS itself, exactly as it already does for `app.terravest.app`.

**Verify before moving on** (from your laptop, not the VM):

```bash
dig +short ops.terravest.app A
# MUST print:  34.139.32.148
# If you see 104.x / 172.67.x  -> still Proxied. Stop; fix it first.
```

Propagation is usually seconds. Don't proceed until that prints the VM IP.

---

## 2. Environment (`.env.prod` on the VM)

`.env.prod` lives **only on the VM** and is never in git.

```bash
ssh -i ~/.ssh/terravest_deploy deploy@34.139.32.148
cd ~/finance-mvp    # wherever the repo lives on the VM
cp .env.prod .env.prod.bak.$(date +%F)   # you will want this
```

Set these:

```bash
# --- The ops origin ---
OPS_DOMAIN=ops.terravest.app

# --- CORS: ADD the ops origin, keep the existing one ---
# Comma-separated, no spaces, no wildcard, and NO inline "# comment" — the value would
# swallow it. Exactly ONE WEB_ORIGINS line: a duplicate silently wins over the first.
# Belt-and-braces: the ops portal calls its OWN origin (its Caddy block proxies /api/*),
# so it is same-origin and CORS never engages. This keeps it working if that ever changes.
WEB_ORIGINS=https://app.terravest.app,https://ops.terravest.app

# --- First ops account (V8 revokes all old staff access — without this nobody can log in) ---
OPS_BOOTSTRAP_EMAIL=you@terravest.app
OPS_BOOTSTRAP_PASSWORD=<a strong one-time password>

# --- Audit chain key: REQUIRED. audit-service refuses to start without it. ---
# NOT the same as AUDIT_INGEST_KEY (that authenticates callers; this signs history).
# Generate:  openssl rand -hex 32
# Treat as APPEND-ONLY: changing it later makes every existing row fail verification.
AUDIT_CHAIN_KEY=<openssl rand -hex 32>

# --- Ops MFA codes: keep false. Deliberately NOT wired to OTP_EXPOSE_DEV_CODE, which is
#     still true in prod pending SendGrid domain auth. ---
OPS_OTP_EXPOSE_DEV_CODE=false
```

> `OPS_BOOTSTRAP_PASSWORD` is read from the environment at startup. Change the password on first
> login and blank the variable afterwards. Leaving both set is harmless — an existing account is
> never reset — but the password sitting in a file isn't doing you any favours.

**Ops MFA needs to reach you.** Sign-in always sends a one-time code, and `OPS_OTP_EXPOSE_DEV_CODE`
is false, so the bootstrap email must actually receive mail. If SendGrid domain auth is still
pending, that code won't arrive and you'll be locked out — check that first, or temporarily set
`OPS_OTP_EXPOSE_DEV_CODE=true`, log in, then set it back to false.

---

## 3. Pre-flight: validate the Caddy config

**Do this before deploying.** A Caddyfile syntax error takes down `app.terravest.app` too, not just
ops.

```bash
docker run --rm \
  -v "$PWD/Caddyfile":/etc/caddy/Caddyfile:ro \
  --env-file .env.prod \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
# Expect: "Valid configuration"
```

---

## 4. Deploy

```bash
cd ~/finance-mvp
git pull
./deploy/deploy.sh
```

This is a **frontend change**, so it must be `deploy.sh` — a plain `docker compose up -d` is
backend-only and would leave the SPA stale (and the ops bundle absent entirely).

Watch for these lines:

```
==> Building web SPA (VITE_API_BASE=https://app.terravest.app)
    ops portal API base: https://ops.terravest.app   <-- MUST be the ops origin, not app
    web built -> web-dist (N entries)
    ops portal built -> web-dist-ops (N entries)     <-- the separate ops bundle
==> Recreating Caddy to pick up the new web build
```

> **If "ops portal API base" says `https://app.terravest.app`**, `OPS_DOMAIN` wasn't set when the
> build ran. The portal will load and then fail every call with
> `Connecting to 'https://app.terravest.app/...' violates ... connect-src 'self'` — the ops CSP
> correctly refusing a cross-origin call. Set `OPS_DOMAIN` and redeploy; don't widen the CSP.

Then confirm the migrations and the bootstrap ran.

> **`docker compose` needs `--env-file .env.prod`.** Compose reads `.env` by default, not
> `.env.prod`, and it interpolates the whole file even for `logs` — so without it you get
> `required variable JWT_SECRET is missing a value` and nothing runs. `deploy.sh` already passes it
> (see `COMPOSE=` at the top). Simpler for log checks: use `docker logs <container>` directly, since
> every service sets an explicit `container_name`.

```bash
# Simplest — no compose, no env interpolation:
docker logs wealth-auth-service 2>&1 | grep -E "OpsBootstrap|Migrating|V1[01]__"
# Expect: V9/V10/V11 applied, and
#   [OpsBootstrap] created first ops account 'you@terravest.app' with OPS_ADMIN.

docker logs wealth-audit-service 2>&1 | grep -i INSECURE
# Expect: NOTHING. A hit means AUDIT_CHAIN_KEY didn't reach the container and the chain is unkeyed.

docker logs wealth-caddy 2>&1 | grep -iE "certificate obtained|obtaining|error"
# Expect: a cert obtained for ops.terravest.app

# Via compose instead? Then it MUST be:
#   docker compose -f docker-compose.prod.yml --env-file .env.prod logs audit-service
```

---

## 5. Validation

Work through these in order. Each one checks something a previous step could have silently broken.

### 5.0 Is the ops portal even switched on?

Run this first — it answers "is it live?" in one shot, and every later check assumes it.

```bash
# On the VM, in the repo dir:

# 1. Is OPS_DOMAIN set to a real hostname (not the inert ops.localhost default)?
grep '^OPS_DOMAIN=' .env.prod
#    OPS_DOMAIN=ops.terravest.app   -> live
#    OPS_DOMAIN=            (blank) -> inert; Caddy is serving ops.localhost internally
#    (no line at all)               -> inert

# 2. Is the ops origin allowed through gateway CORS?
grep '^WEB_ORIGINS=' .env.prod
#    must contain https://ops.terravest.app  -> else every ops API call fails CORS

# 3. Did the ops bundle actually get built and staged?
ls web-dist-ops/ | head
#    expect: ops.html, assets/, vendor/ ...
#    empty/missing -> deploy.sh didn't run the ops build (are you on the merged main?)

# 4. Is Caddy serving it?
docker exec wealth-caddy ls /srv-ops | head
#    expect the same files. Nothing here -> the ./web-dist-ops:/srv-ops mount didn't take;
#    Caddy needs recreating (deploy.sh does this).
```

If steps 1–4 are all good, `https://ops.terravest.app` should load. If it doesn't, the answer is
almost always DNS still being Proxied — go back to §1.

### 5.1 The member app is untouched

```bash
curl -sI https://app.terravest.app | head -1        # 200
curl -sI https://app.terravest.app/ops | head -1    # 200 (SPA fallback) — but see below
```

Open `https://app.terravest.app/ops` in a browser: it should render the **member app**, not the ops
portal. The ops bundle isn't there any more. (The SPA fallback serves index.html for unknown paths,
so a 200 is expected — what matters is what renders.)

### 5.2 TLS and headers on the new origin

```bash
curl -sI https://ops.terravest.app | head -1
# 200, and no certificate warning = Caddy got a real Let's Encrypt cert.

curl -sI https://ops.terravest.app | grep -iE "content-security-policy|x-robots-tag|strict-transport"
# CSP should be the TIGHT one: script-src 'self' with no Plaid/Maps/OAuth origins.
# X-Robots-Tag: noindex — this is an internal tool.
```

If TLS fails here, it's almost always the orange cloud. Re-check `dig +short ops.terravest.app`.

### 5.3 Sign in

Go to `https://ops.terravest.app`. You should get the **staff sign-in**, not the member login.

- Enter the bootstrap email + password → it asks for a code
- The code arrives by email → enter it → the portal loads
- **Change your password now**, then blank `OPS_BOOTSTRAP_PASSWORD` in `.env.prod`

### 5.4 The boundary holds (the point of the whole exercise)

```bash
# Grab an ops token (dev-code path is off in prod, so do this in the browser devtools instead:)
#   localStorage.getItem('terravest_ops_token')   on ops.terravest.app
OPS='<paste it>'

# An ops token must be REFUSED on member routes:
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OPS" https://app.terravest.app/api/v1/auth/me
# Expect 403

# ...and accepted on the ops surface:
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OPS" https://app.terravest.app/api/v1/support/users
# Expect 200
```

**In the browser, on `app.terravest.app`, open devtools and run:**

```js
localStorage.getItem('terravest_ops_token')   // MUST be null
```

That's the split working: the member origin cannot see the ops session. If it returns a token,
you're still on the shared origin — the deploy didn't take.

### 5.5 The controls

In the portal:

| Check | Expected |
|---|---|
| **Ops Accounts → Access matrix** | Renders live from the DB; `customer.pii.reveal` is ✅ for Supervisor, — for Agent |
| Open a customer → **Identity** tile | Shows `SSN ••••` with a **Reveal** button — not the digits |
| Click **Reveal** without a reason | Refused; it demands ≥8 characters |
| Reveal with a reason | Shows the last 4 |
| **Staff access** tab on that customer | Your `ops.pii.reveal` is listed, with your reason |
| **Money desk → Approvals** | Loads (empty is fine) |
| Propose a **$5 credit** | Executes immediately, appears in the ledger |
| Propose a **$90 refund** | Goes to **PENDING_APPROVAL**, no money moves |
| Try to approve your own $90 | **409** — "needs a second pair of eyes" |

> ⚠️ `PAYMENT_PROVIDER` defaults to `mock`. A refund writes a real ledger entry and a real audit
> trail but **moves no money**, and says so in the logs. That is intended until you set
> `payment.provider=stripe` with real keys.

### 5.6 The audit chain

```bash
curl -s -H "X-Internal-Key: $AUDIT_INGEST_KEY" https://app.terravest.app/api/v1/audit/verify | jq
# Expect: {"valid": true, "chain": {...}, "checkpoints": {...}}
```

> **Expect `chain.valid: false` on the FIRST run after this deploy if you have pre-existing audit
> rows.** Every row written before the timestamp fix hashed a nanosecond value the database rounded
> away, so it can never be recomputed — those rows were never verifiable, on any deploy. **This is
> not evidence of tampering.** Rows written from this deploy forward do verify; if it still reports
> invalid for rows created *after* the deploy, that's real and worth investigating.

---

## 6. Afterwards

- [ ] Change the bootstrap password; blank `OPS_BOOTSTRAP_PASSWORD`
- [ ] Create the real ops accounts (**Ops Accounts → New ops account**) with the narrowest role that
      does the job — agents don't need `customer.pii.reveal`
- [ ] Re-derive the **$25 auto-approve threshold** from your actual Stripe refund distribution and
      update `ops_finance_config`. The seeded number is a guess
- [ ] Back up `AUDIT_CHAIN_KEY` somewhere you won't lose it. Lose it and no historical row verifies
      again — ever
- [ ] Consider an IP allowlist on `ops.terravest.app` at the **GCP firewall** (not Cloudflare — that
      would put a third party back in the PII path)
