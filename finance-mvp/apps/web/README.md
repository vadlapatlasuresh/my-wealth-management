# TerraVest — Web

React single-page application for the TerraVest finance dashboard (mockup-aligned UI with sidebar shell, Home, Cash, Invest, Plan, Bill Pay wizard, Learn, Profile, and AI Coach rail). Authenticates against the API, then loads snapshot, accounts, transactions, AI insights, bill-pay intents, and debt simulations.

**Default URL:** http://localhost:5173  
**API dependency:** http://localhost:4000 (must be running)

---

## Tech stack

| Layer | Technology |
|-------|------------|
| UI library | React 18 |
| DOM | react-dom |
| Bundler / dev server | Vite 5 |
| React plugin | @vitejs/plugin-react |
| Language | JSX (JavaScript) |
| Styling | Global CSS (`src/styles.css`) |
| Routing | In-page anchors + single `App` (no react-router yet) |
| State | React `useState` / `useEffect` |
| API | Native `fetch` via `src/api.js` |

---

## Project layout

```
apps/web/
├── index.html           # Entry HTML
├── vite.config.js       # Dev server port 5173
├── package.json
└── src/
    ├── main.jsx         # ReactDOM.createRoot
    ├── App.jsx          # Main UI: auth, dashboard, forms
    ├── api.js           # API client + token storage
    └── styles.css       # Layout, cards, tables, auth screen
```

---

## How to run

**Prerequisites:** API running with seeded demo user (see `apps/api/README.md`).

From monorepo root:

```bash
npm run dev:web
```

From this directory:

```bash
npm run dev
```

Production build:

```bash
npm run build      # → dist/
npm run preview    # serve dist locally
```

---

## Configuration

API base URL is hardcoded in `src/api.js`:

```javascript
const API_BASE = "http://localhost:4000";
```

To point at another host/port, change `API_BASE` or add Vite env support:

```javascript
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";
```

(create `.env` with `VITE_API_URL=http://localhost:4000`)

---

## Authentication UX

1. If no token in `localStorage` (`finance_token`), show **Sign In / Register** form.
2. On success, `setAuthToken(token)` and load dashboard data.
3. **Logout** clears token and resets all loaded state.

Default form prefill (for local dev):

- Email: `demo@finance.app`
- Password: `Demo@1234`

---

## UI pages (authenticated)

| Page | Route key | Data source |
|------|-----------|-------------|
| **Home** | `home` | Snapshot, transactions, AI rail |
| **Cash & cards** | `cash` | Accounts table + transactions |
| **Invest** | `invest` | Snapshot + mock holdings/marketplace |
| **Plan** | `plan` | Mock budget grid + debt compare API |
| **Bill pay** | `billpay` | 5-step wizard + bill-pay intents |
| **Learn** | `learn` | Static education modules (mock) |
| **Profile** | `profile` | User email + logout |

Shell: TerraVest sidebar, top search bar, **Pay bill** CTA, optional **AI Coach** right rail on Home.

**Refresh** button re-fetches all endpoints in parallel.

---

## API client (`src/api.js`)

| Method | Endpoint | Auth |
|--------|----------|------|
| `api.register({ email, password })` | POST `/v1/auth/register` | No |
| `api.login({ email, password })` | POST `/v1/auth/login` | No |
| `api.getSnapshot()` | GET `/v1/me/snapshot` | Yes |
| `api.getAccounts()` | GET `/v1/accounts` | Yes |
| `api.getTransactions()` | GET `/v1/transactions` | Yes |
| `api.getInsights()` | GET `/v1/ai/insights` | Yes |
| `api.getPaymentIntents()` | GET `/v1/payments/bill-pay-intents` | Yes |
| `api.createBillPayIntent(payload)` | POST `/v1/payments/bill-pay-intents` | Yes |
| `api.runDebtScenario(payload)` | POST `/v1/planning/debt-scenarios` | Yes |

Errors throw `Error` with `message` from API body when available.

---

## Bill pay form defaults

After `getAccounts()` loads, the form auto-selects:

- First `CREDIT_CARD` → `card_account_id`
- First `CHECKING` or `SAVINGS` → `funding_account_id`

Account IDs are Prisma CUIDs from the API (not fixed strings).

---

## Styling

- Sidebar + main content grid (desktop)
- Responsive: sidebar hidden below ~1080px
- Semantic colors: teal primary (`#0d9488`), insight badges (actionable / warning / informational)

Design tokens and frame specs from planning phase live in repo `docs/` (Figma handoff notes in conversation history).

---

## Scripts

| Script | Description |
|--------|-------------|
| `dev` | Vite dev server, HMR |
| `build` | Production bundle to `dist/` |
| `preview` | Preview production build |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank after login | Open devtools → Network; verify API 200s |
| `Failed to fetch` | Start API on port 4000 |
| 401 on all calls | Log out and log in again |
| CORS | Ensure API has `cors()` enabled (default) |

---

## Related docs

- [Root README](../../README.md)
- [API README](../api/README.md)
- [API sample responses](../../docs/api-sample-responses.md)
