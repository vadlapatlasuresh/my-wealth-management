# Phases 0–2 — COMPLETED ✅

Recap of foundation, core money features, and the UI redesign. Kept for reference; all items
below are done and verified locally.

## Phase 0 — Foundation & run-fixes
- [x] All 4 Java services build (`mvn package`) and boot on H2 in-memory (dev profile).
- [x] Gateway routes: `/api/v1/auth/**`→8081, `/api/v1/aggregation/**`→8082,
      `/api/v1/me/**` & `/api/v1/planning/**`→8083, `/v1/**`→Node 4000.
- [x] CORS: handled **only** at the gateway (`GatewayCorsConfig` CorsWebFilter). Downstream
      CORS disabled (aggregation `SecurityConfig`, Node `app.use(cors())` removed) → exactly one
      `Access-Control-Allow-Origin` header.
- [x] Budget GET 403 fixed — `month` is a reserved word in H2; entity column backtick-quoted.
- [x] Budget PUT 403 fixed — JPA `orphanRemoval` collection mutated in place, not reassigned.
- [x] Node API: absolute SQLite path in `.env`, `node --env-file=.env`, `unhandledRejection`/
      `uncaughtException` guards, all routes return JSON.
- [x] Frontend auto-logout on 401/403 (clears stale token, drops to login).

## Phase 1 — Core accounts & money
- [x] **Auth** — register/login through gateway → auth-service; JWT persisted client-side.
- [x] **Plaid aggregation** — `link-token/create`, `public-token/exchange`, `accounts`,
      `transactions`. `plaid-java` upgraded **9.0.0 → 35.0.0** (fixes `Unexpected value
      'identity_match'` and other newer enums). Exchange returns JSON (not bare string).
- [x] **Financial core** — net-worth snapshot, budgets (GET/PUT by month), debt scenarios.

## Phase 2 — UI redesign (TerraVest design system)
- [x] Single source of truth: `apps/web/src/styles/terravest-theme.css` (only stylesheet loaded).
- [x] Removed reliance on the unloaded legacy `styles.css` (cause of "plaintext" screens).
- [x] Redesigned pages: **Accounts** (grouped account cards, KPI summary, info tooltips,
      refresh + per-account drill-in), **Transactions** (KPIs + filter bar + segmented
      income/spending + `tv-table`), **Invest**, **Cash**, **Profile**, **Learn**, **Auth/Login**.
- [x] Audited/cleaned: Plan, Bill Pay, Deal Room, AI Assistant, My Business, Real Estate,
      NetWorthChart (removed stray non-theme classes).
- [x] New shared theme components: `.filter-bar`, `.filter-search`, `.seg-control/.seg-btn`,
      `.toggle`, `.setting-row`, `.stat-tile`, `.card-grid`, `.info-tip`, `.table-scroll`.
- [x] `assets/terravest-redesign.html` updated with full Accounts + Transactions mockups.
- [x] `npm run build -w apps/web` passes; all 57 modules compile.

### Verification snapshot
All gateway routes return 200 with a single CORS header; Plaid link flow completes end-to-end
in sandbox; every page renders with the design system (no plaintext).
