# Phase 3 — Real Estate Service (Zillow integration) ✅ DONE (mock provider)

> **Status:** Built and live. `real-estate-service` (:8084) provides full CRUD + `/{id}/revalue`
> at `/api/v1/real-estate`; `RealEstatePage` is wired; 2 properties seeded for userId 1.
> Valuation uses `MockPropertyValuationProvider` — set `REALESTATE_PROVIDER_API_KEY` and implement
> the real `PropertyValuationProvider` (RentCast/ATTOM) to go live. Checklist below kept for the real-API cutover.


**Goal:** Replace the mock `/v1/real-estate` Node routes with a real Java microservice that
stores properties and enriches them with valuation data (Zillow or an alternative such as
RentCast/ATTOM, since Zillow's public API is restricted).

## Backend
- [ ] Scaffold `apps/real-estate-service` (Spring Boot 3.2.5, Java 17), port **8084**, mirroring
      `account-aggregation-service` (SecurityConfig with shared JWT, H2 dev / Postgres prod, Flyway).
- [ ] Entity `Property`: id, userId, address, type (PRIMARY/RENTAL/LAND), purchasePrice,
      purchaseDate, currentValue, mortgageBalance, equity (derived), lastValuedAt.
- [ ] Flyway `V1__create_real_estate_tables.sql`.
- [ ] Integration client for a valuation provider (config: `realestate.provider.api-key`).
      Start with manual `currentValue` entry; add provider lookup behind an interface so it can
      be swapped. (Zillow Zestimate has no open API — use RentCast/ATTOM or scrape-free CSV import.)
- [ ] Endpoints (under `/api/v1/real-estate`): `GET /` (list), `POST /` (add), `GET /{id}`,
      `PUT /{id}`, `DELETE /{id}`, `POST /{id}/revalue`.
- [ ] Gateway route: `/api/v1/real-estate/**` → 8084. Remove the legacy `/v1/real-estate` mock.
- [ ] Add to `npm run build:backend` / `start:backend`.

## Frontend
- [ ] Point `api.getRealEstate()` / `getRealEstateDetail()` to `/api/v1/real-estate`.
- [ ] `RealEstatePage.jsx` already uses `property-card` theme classes — wire it to live data,
      add an "Add property" modal/form (form-group/form-input), and a revalue action.
- [ ] Feed real-estate equity/value into HomePage KPIs (replace mock).

## Env / keys
- [ ] `realestate.provider.api-key` (RentCast/ATTOM) in env/secret store.

## Acceptance criteria
- [ ] Add a property in the UI → persists → appears with equity computed.
- [ ] Revalue updates `currentValue` from the provider (or manual) and reflects in Home KPIs.
- [ ] Route returns single CORS header; auth required; data scoped to the JWT user.
