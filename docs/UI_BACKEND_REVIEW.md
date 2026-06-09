# TerraVest — UI & Backend Review: flaws & recommended changes

Grounded in the actual code (file refs below). Severity: 🔴 high · 🟡 medium · 🟢 low/polish.
Each item: what, why it matters, the fix.

---

## Backend

### 🔴 1. Inter-service calls route THROUGH the gateway
financial-core's Feign clients point at `${api-gateway.url}/api/v1/...`
(`clients/RealEstateClient.java`, `AccountAggregationClient.java`). So
service→service traffic does service→gateway→service: an extra hop, the gateway
becomes a single point of failure for internal calls, and it double-audits.
**Fix:** call services directly (`service.<name>.uri` like the gateway already
defines) or add real service discovery; keep the gateway browser-facing only.

### 🔴 2. Account deletion doesn't cascade (data integrity + GDPR)
`auth/AuthService.deleteUser` does `userRepository.deleteById(userId)` only —
goals/debts/budgets/snapshots, Plaid items/accounts/transactions, properties,
notifications survive. **Fix:** internal-key `DELETE by-user` in each data service,
orchestrated from the delete flow (idempotent, audited).

### 🔴 3. No refresh tokens / revocation
Only short-lived access tokens (`auth`); expiry drops the user to login
mid-session, and a leaked token can't be revoked. **Fix:** refresh tokens
(rotating, httpOnly cookie) + a server-side token/blocklist; sliding session.

### 🟡 4. Inconsistent error handling across services
Only account-aggregation has a `GlobalExceptionHandler`; others rely on
`/error` permitAll (now added) but return Spring's default body. **Fix:** a shared
`@RestControllerAdvice` (a small common module) → one error envelope
`{code,message,requestId}` everywhere; map validation→400, not-found→404, etc.

### 🟡 5. Thin input validation
Only ~2 services use `@Valid`. Request DTOs largely unvalidated → bad input
becomes 500s. **Fix:** `@Valid` + Bean Validation annotations on every request DTO
(amounts ≥ 0, required fields, sizes), surfaced via the advice above.

### 🟡 6. No gateway rate limiting / request-size limits
No `RequestRateLimiter`/bucket4j; login + Plaid endpoints are unthrottled.
**Fix:** per-IP/user rate limits at the gateway (Redis token bucket), max body
size, and basic WAF-style header limits — important before public exposure.

### 🟡 7. Deprecated Spring Security DSL in all 10 services
Every `SecurityConfig` uses the removed-in-7 `.csrf().disable()`/`.and()` chain.
**Fix:** migrate to the lambda DSL (`http.csrf(c->c.disable()).authorizeHttpRequests(a->…)`)
to stay upgradable; centralize the JWT filter + matchers in a shared config.

### 🟡 8. Audit chain is single-writer / in-process lock
`AuditChainService.append` is `synchronized` — correct for one instance, but a
scaled audit-service could fork the chain. **Fix:** DB advisory lock or a
single-writer ingestion queue; document the constraint (already noted in code).

### 🟢 9. Lazy-only derived data
Net-worth history and Plaid transactions sync on read, not on a schedule, so an
inactive user has gaps and stale transactions. **Fix:** scheduled jobs
(daily snapshot per linked user; periodic `/transactions/sync`) + the Plaid
webhook in prod (it can't reach localhost in dev).

### 🟢 10. A few residual static values
RealEstate KPI 30-day deltas and InvestPage allocation %s are fixed constants
(per the inventory). **Fix:** derive from real history / holdings, or label as
illustrative.

### 🟢 11. Dev/prod hygiene
Shared static internal audit key; Hikari pool pinned to 5 (a dev workaround for
one shared Postgres). **Fix:** per-service DBs + sized pools in prod; rotate the
internal key via secrets.

---

## Frontend / UI

### 🔴 12. JWT stored in `localStorage` (`api.js`)
Readable by any injected script → XSS can exfiltrate the session. **Fix:** prefer
an httpOnly, Secure, SameSite cookie for the token (pairs with #3); if staying in
JS, add a strict CSP and sanitize all rendered HTML.

### 🟡 13. Aggressive 401/403 → logout
`request()` clears the token and logs out on ANY 401/403. With the old
error-masking this caused surprise logouts (now mitigated). **Fix:** only logout
on genuine auth failures (token-expired), not on per-endpoint authorization 403s.

### 🟡 14. "Building history" chart UX
Real net-worth series is empty until ≥2 daily snapshots, so a new/linked user sees
an empty chart. **Fix:** seed an immediate point at link time + show a friendly
"history is building" affordance (and back it with the scheduled snapshot, #9).

### 🟡 15. Loading/skeleton + error states uneven
Some pages have skeletons/empty states, others flash or render blank during
fetch. **Fix:** standard `<Loading/>`, `<EmptyState/>`, and inline error
components used consistently across pages.

### 🟢 16. Accessibility pass
Focus rings + reduced-motion exist; gaps likely remain in form labels/aria,
color-contrast on sage text, table semantics, and dialog focus-trap. **Fix:** an
a11y sweep (labels, roles, contrast AA, keyboard nav for menus/drawer).

### 🟢 17. Machine-translated page bodies
Chrome strings are human-translated; page bodies are MT (quality varies). **Fix:**
key the high-traffic page strings via `t()` so they use vetted translations.

### 🟢 18. Mobile depth
The shell is responsive (drawer added), but it's a wrapped desktop layout. **Fix:**
native-feeling mobile patterns (bottom tab bar in the Capacitor build, larger tap
targets) — the design mockups already show the target.

---

## Suggested sequencing
1. **Security core:** #2 delete-cascade, #3 refresh tokens + #12 cookie storage, #6 rate limiting.
2. **Robustness:** #4 error advice + #5 validation (do together), #7 security DSL migration.
3. **Architecture:** #1 direct service calls.
4. **Data freshness:** #9 scheduled snapshot + txn sync (+ webhook in prod), #14 chart UX.
5. **Polish:** #15 states, #16 a11y, #10/#17 residual statics & translations, #18 mobile.

Most of #2,#4,#5,#7,#9,#13,#14,#15 are **pure code** (no keys); #3/#6/#12 are
security design choices; everything else is incremental.
