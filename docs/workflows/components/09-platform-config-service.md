# Component · Platform Config / Content Service (:8089) — DB ✅

**Responsibility:** drives the app from config — enabled modules, sections, feature flags, app
settings (incl. theme), and **disclaimers/legal content** with acceptance tracking. All DB-backed.
**Source:** [finance-mvp/apps/platform-config-service](../../../finance-mvp/apps/platform-config-service) · 🗄️ schema `platform_config`

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/config/app?platform=web` | modules, sections, settings, theme |
| GET | `/api/v1/config/flags` | feature flags |
| GET | `/api/v1/content/disclaimers?keys=&locale=` | current disclaimer versions (markdown) |
| POST | `/api/v1/content/disclaimers/accept` | record acceptance |

## Data model
```mermaid
erDiagram
    APP_SECTION { string id PK; string label; int sort_order }
    APP_MODULE { string id PK; string title; string icon; string route; string section; int sort_order; boolean enabled; string platforms; string required_flags }
    FEATURE_FLAG { string flag_key PK; boolean enabled }
    APP_SETTING { string setting_key PK; string setting_value }
    DISCLAIMER { bigint id PK; string disclaimer_key; int version; string locale; string title; text body_markdown; boolean requires_acceptance; timestamp effective_at }
    DISCLAIMER_ACCEPTANCE { bigint id PK; bigint user_id; string disclaimer_key; int version; timestamp accepted_at }
```
Migrations: `V1__create_platform_config_tables`, `V2__seed_platform_config` (seeds modules/flags/disclaimers).

## Config-driven UI flow
```mermaid
sequenceDiagram
    participant WEB as Web (remoteConfig.js)
    participant CFG as platform-config
    WEB->>CFG: GET /config/app + /config/flags
    CFG-->>WEB: modules/sections/flags/theme (from DB)
    WEB->>WEB: build nav, gate features by flag, set theme (cache + DEFAULT_CONFIG fallback)
    WEB->>CFG: GET /content/disclaimers (when a screen needs legal copy)
    CFG-->>WEB: markdown; on accept → POST /content/disclaimers/accept (🗄️ disclaimer_acceptance)
```

## Status / pending
- ✅ DB-backed config + flags + disclaimers; **`disclaimer_acceptance` is the one real consent trail**.
- ⬜ Optional managed flag provider (LaunchDarkly/Unleash) behind `ConfigProvider`; broaden disclaimer coverage (only RE valuation wired in the web today); admin UI for non-engineers to edit content.
