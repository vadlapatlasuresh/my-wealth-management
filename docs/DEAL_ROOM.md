# Deal Room — Feature Reference

_Last updated: 2026-06-07_

The Deal Room lets sponsors (LLCs/operators) **register investment deals** and lets
investors **discover, vet, and express interest** in them. It is a two-sided marketplace
built into TerraVest. All endpoints live in **real-estate-service** (gateway routes
`/api/v1/deals/**` and `/api/v1/sponsor/**`), with an in-app notification to the sponsor
delivered through **notification-service**.

---

## 1. Roles & workflows

### Sponsor (deal-adder)
1. **Register a deal** — title, category + subcategory, return structure, economics, website, description.
2. **Attach documents** — link the PPM, financials, operating agreement, data room (link-based).
3. **Maintain a track record** — previous projects shown on every deal they publish.
4. **Publish** — set status to `OPEN` so it appears in the marketplace.
5. **Work leads** — see interested investors (name, email, phone, commitment amount,
   accreditation), and advance each through `NEW → CONTACTED → COMMITTED → PASSED`.
6. Gets an **in-app notification** the moment an investor expresses interest.

### Investor
1. **Browse the marketplace** — filter by category/subcategory/return type; sort by
   newest, highest return, lowest minimum, or largest raise; paginated.
2. **Save** deals to a watchlist.
3. **Open a deal** — full detail: returns, distributions, hold period, raise progress,
   documents, and the sponsor's track record.
4. **Express interest** — must attest accreditation; shares name/email/phone (+ optional
   commitment amount and message) with the sponsor.
5. **Track interest** under *My Interests*, including the sponsor's status on their lead.

---

## 2. Data model

| Entity | Table | Purpose |
|---|---|---|
| `Deal` | `deals` | The opportunity (taxonomy, returns, economics, status, websiteUrl). |
| `DealInterest` | `deal_interests` | A lead: contact details, commitment amount, accreditation, lead status. |
| `SponsorProject` | `sponsor_projects` | Sponsor's track record (previous projects). |
| `DealDocument` | `deal_documents` | Link-based document attached to a deal. |
| `DealWatch` | `deal_watches` | An investor's saved deal (unique per user+deal). |

**Taxonomy** (single source of truth: `DealTaxonomy.java`, exposed at `GET /api/v1/deals/taxonomy`):
- **Categories**: `REAL_ESTATE`, `BUSINESS`, `PRIVATE_EQUITY`, `STARTUP`, `OTHER`.
- **Subcategories** (real estate): `MULTIFAMILY`, `SINGLE_FAMILY`, `TOWNHOMES`,
  `CONSTRUCTION`, `LAND`, `COMMERCIAL`, `MIXED_USE` (plus sets for the other categories).
- **Return types**: `FIXED` (annual % range, e.g. 12–24%), `EQUITY` (target IRR), `HYBRID` (both).
- **Distribution frequency**: `MONTHLY`, `QUARTERLY`, `ANNUAL`, `AT_EXIT`.
- **Deal status**: `DRAFT`, `OPEN`, `CLOSED`, `FUNDED`.
- **Lead status**: `NEW`, `CONTACTED`, `COMMITTED`, `PASSED`.

Migrations: `V3` deals · `V4` interests · `V5` sponsor projects + deal websiteUrl ·
`V6` taxonomy + lead status · `V7` commitments + accreditation + documents + watchlist.

---

## 3. API

### Deals (sponsor management)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/deals` | The caller's own deals (+ `interestCount`, `committedAmount`). |
| POST | `/api/v1/deals` | Create. |
| PUT | `/api/v1/deals/{id}` | Update (owner-only). |
| DELETE | `/api/v1/deals/{id}` | Delete (owner-only). |
| GET | `/api/v1/deals/taxonomy` | Categories/subcategories/return types/… for UI dropdowns. |

### Marketplace & discovery (investor)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/deals/marketplace` | OPEN deals. Params: `category`, `subcategory`, `returnType`, `sort` (`NEWEST`/`RETURN_DESC`/`MIN_INVESTMENT_ASC`/`TARGET_RAISE_DESC`), `limit` (≤100, default 24), `offset`. |
| GET | `/api/v1/deals/{id}` | Detail — visible if OPEN or owner. |
| GET | `/api/v1/deals/watchlist` | The investor's saved deals. |
| POST/DELETE | `/api/v1/deals/{id}/watch` | Save / unsave (idempotent). |
| GET | `/api/v1/deals/my-interests` | Deals the investor expressed interest in (+ lead status). |

### Interest (leads)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/deals/{id}/interests` | Express interest. Requires `accredited=true`; deal must be OPEN; no duplicates; can't be your own deal. |
| GET | `/api/v1/deals/{id}/interests` | Owner-only: list leads. |
| PUT | `/api/v1/deals/{id}/interests/{interestId}/status` | Owner-only: set lead status. |

### Documents & track record
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/deals/{id}/documents` | Visible if OPEN or owner. |
| POST | `/api/v1/deals/{id}/documents` | Owner-only: attach a link (`label`, `url`, `docType`). |
| DELETE | `/api/v1/deals/{id}/documents/{docId}` | Owner-only. |
| GET | `/api/v1/deals/{id}/sponsor-projects` | Sponsor's track record on the deal page. |
| GET/POST/PUT/DELETE | `/api/v1/sponsor/projects[/{id}]` | Manage the caller's own track record. |

### Internal (service-to-service)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/notifications/internal` | Create an in-app notification for a user. Guarded by `X-Internal-Key`. Called best-effort by real-estate-service on new interest. |

---

## 4. Validation & guardrails

- **Ownership scoping (IDOR-safe)**: another user's deal/lead/document/project returns
  **404**, never leaks existence.
- **Taxonomy**: subcategory must belong to its category; return type, distribution
  frequency, statuses validated against the allow-lists.
- **Returns**: non-negative, capped (catches fat-finger %); fixed `min ≤ max`.
- **URLs** (website + documents + project links): only `http`/`https` accepted
  (`Urls.java`), blocking `javascript:`/`data:`; rendered with `rel="noopener noreferrer"`.
- **Interest**: accreditation attestation required; one interest per investor per deal
  (409 on duplicate); can't express interest in a non-OPEN deal or your own deal.
- **Raise progress**: `committedAmount` = sum of investor commitment amounts; shown as
  an indicative (non-binding) progress bar on the detail page.

---

## 5. Configuration (env)

| Var | Service | Purpose |
|---|---|---|
| `NOTIFICATIONS_INTERNAL_KEY` | real-estate + notification | Shared `X-Internal-Key` for the internal notification ingest. Set the same value in both. |
| `NOTIFICATION_URI` | real-estate | Base URL of notification-service (default `http://localhost:8088`). |
| `LEADS_NOTIFY_ENABLED` | real-estate | Toggle sponsor notifications (default `true`). |

---

## 6. Frontend

Single page: [`apps/web/src/pages/DealRoomPage.jsx`](../finance-mvp/apps/web/src/pages/DealRoomPage.jsx).
Tabs: **My Deals · Marketplace · Saved · My Interests · Track Record**, plus sub-views for
deal detail (with interest form), owner leads, and owner documents. API client methods in
[`apps/web/src/api.js`](../finance-mvp/apps/web/src/api.js). The frontend taxonomy mirrors
the backend; the server remains the source of truth for validation.

---

## 7. Tests

`DealServiceTest` (19) + `SponsorProjectServiceTest` (3) cover: ownership scoping,
taxonomy + return validation, marketplace filtering/pagination, duplicate-interest and
accreditation gating, commitment capture + sponsor notification, lead-status updates,
watchlist idempotency, and URL safety.

---

## 8. Still pending (future work)

- **Email/SMS to sponsor** on new lead — currently in-app only; needs a sponsor-email
  lookup (auth-service) to add the email channel (notification-service already supports it).
- **True file uploads** for documents (object storage) — today documents are link-based.
- **Verified accreditation / KYC** — today it's self-attestation; integrate a KYC provider
  before treating it as compliant.
- **Binding commitments & e-sign** — commitments are indicative; a real flow needs
  subscription docs + signatures.
- **Marketplace search** (free-text) and saved-search alerts.
