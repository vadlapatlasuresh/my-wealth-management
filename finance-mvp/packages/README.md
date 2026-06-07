# packages/

Shared, app-agnostic packages for the TerraVest monorepo.

## Today (Capacitor path)

We chose the **Capacitor** path: the web app under `apps/web` (Vite + React) is
the single shared UI codebase, wrapped for iOS/Android with Capacitor. There is
no separate native UI. So today the only shared package is:

| Package | Status | Purpose |
| --- | --- | --- |
| `@terravest/tokens` | live | Design tokens — single source of truth for colors, spacing, radii, typography, shadows across all themes (light/dark/glass). Consumed by web (CSS vars) and by any future native consumer (raw JSON). |

## Future (optional Expo path)

If the project later moves to a shared React Native + Expo architecture, these
packages are the intended split. They do **not** exist yet:

| Package | Purpose |
| --- | --- |
| `@terravest/ui` | Cross-platform component library built on the tokens |
| `@terravest/features` | Feature modules (accounts, transactions, ...) shared web + native |
| `@terravest/core` | API client, auth, models, shared business logic |
| `@terravest/config` | Client for platform-config-service (nav/module registry, flags) |

Until then, `apps/web` remains the shared UI and Capacitor provides the
native shells. See `../DEPLOYMENT.md` and `../MIGRATION.md`.
