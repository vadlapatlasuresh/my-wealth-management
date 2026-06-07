# Notifications Flow

How notification preferences are read/saved (Profile page) and how the notification feed plus
test/mark-read work. `notification-service` (:8088) persists notifications and per-user
preferences; the mock provider logs deliveries instead of sending real email/push.

## Sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as ProfilePage.jsx
    participant API as api.js
    participant GW as API Gateway :8080
    participant SVC as notification-service :8088<br/>NotificationController
    participant PROV as MockNotificationProvider
    participant DB as (H2 notifdb) notification_preferences / notifications

    User->>UI: Open Profile
    UI->>API: api.getNotificationPreferences()
    API->>GW: GET /api/v1/notifications/preferences + JWT
    GW->>SVC: route /api/v1/notifications/** → :8088
    SVC->>DB: findByUserId(userId) (else create defaults)
    SVC-->>UI: PreferenceDto

    User->>UI: Toggle a preference
    UI->>API: api.putNotificationPreferences(payload)
    API->>GW: PUT /api/v1/notifications/preferences + JWT
    SVC->>DB: save(NotificationPreference)
    SVC-->>UI: PreferenceDto (optimistic toggle; revert on error)

    User->>UI: (feed / test)
    UI->>API: api.getNotifications() / api.testNotification() / api.markNotificationRead(id)
    API->>GW: GET / POST /test / POST /{id}/read + JWT
    SVC->>PROV: send(userId, type, title, body, channel)
    PROV->>DB: save(Notification), log delivery
    SVC->>DB: read / mark is_read=true
    SVC-->>UI: { "items": [NotificationDto] } / NotificationDto
```

## Request trace

1. `apps/web/src/pages/ProfilePage.jsx`: on mount loads prefs via
   `api.getNotificationPreferences()`; each toggle does an **optimistic** update then
   `api.putNotificationPreferences(toPayload(next))`, reverting and showing `prefsError` on
   failure. (`darkMode` is local-only and excluded from the payload.)
2. `apps/web/src/api.js`: `getNotifications()` = `GET /api/v1/notifications`;
   `getNotificationPreferences()` = `GET /preferences`;
   `putNotificationPreferences(payload)` = `PUT /preferences`;
   `testNotification()` = `POST /test`; `markNotificationRead(id)` = `POST /{id}/read`.
   All carry the Bearer JWT.
3. **API Gateway :8080** routes `/api/v1/notifications/**` → `notification-service :8088`.
4. `NotificationController`:
   - `GET ""` → `NotificationRepository.findByUserIdOrderByCreatedAtDesc(userId)` →
     `Map.of("items", items)`.
   - `GET /preferences` → `NotificationPreferenceRepository.findByUserId(userId)` or create
     defaults (`emailEnabled/weeklySummary/budgetAlerts/paymentAlerts = true`, `pushEnabled = false`).
   - `PUT /preferences` (`PreferenceDto` body) → upsert and save.
   - `POST /test` → `notificationProvider.send(userId, "SYSTEM", "Test notification", ..., "INAPP")`
     then returns the newest notification.
   - `POST /{id}/read` → owner-scoped lookup, sets `readFlag = true`, saves (`404` if not owned).
5. `userId` is read from the JWT principal name (`SecurityContextHolder...getName()`).

## Data

`GET /api/v1/notifications` response (wrapped in `items`, `NotificationDto`):
```json
{
  "items": [
    {
      "id": 1,
      "type": "BUDGET",
      "title": "Budget alert: Dining",
      "body": "You've used 85% of your Dining budget for this month.",
      "channel": "INAPP",
      "read": false,
      "createdAt": "2026-06-06T10:00:00"
    }
  ]
}
```
`type` ∈ `BUDGET | PAYMENT | ACCOUNT | SYSTEM`; `channel` ∈ `EMAIL | PUSH | INAPP`.

`GET /preferences` / `PUT /preferences` body + response (`PreferenceDto`):
```json
{
  "emailEnabled": true,
  "pushEnabled": false,
  "weeklySummary": true,
  "budgetAlerts": true,
  "paymentAlerts": true
}
```
`POST /test` and `POST /{id}/read` return a single `NotificationDto`.

## Storage

- DB: H2 `notifdb` (dev) / PostgreSQL (prod).
- Table `notifications` (entity `Notification`). Key columns: `id`, `user_id`, `type`, `title`,
  `body` (TEXT), `channel`, `is_read` (field `readFlag`), `created_at`.
- Table `notification_preferences` (entity `NotificationPreference`). Key columns: `id`,
  `user_id` (unique), `email_enabled`, `push_enabled`, `weekly_summary`, `budget_alerts`,
  `payment_alerts`.

## Provider (mock → real)

- Interface: `NotificationProvider` (`send(userId, type, title, body, channel)`).
- Mock: `MockNotificationProvider` — persists a `Notification` row and logs the delivery
  (`[MockNotificationProvider] Sent ...`); no real email/push is dispatched.
- To go live (see `docs/phases/PHASE_7_NOTIFICATIONS.md`): dispatch by channel — `EMAIL` via
  **SendGrid** (or SES), `PUSH` via **Firebase Cloud Messaging** (FCM/APNs). Config keys:
  `SENDGRID_API_KEY` (email) and `FCM_SERVER_KEY` (push). Honor `notification_preferences`
  before sending on each channel.

## Notes

- **Auth required:** all `/api/v1/notifications/**` endpoints need a valid Bearer JWT; `401/403`
  clears the client token and redirects to login.
- **Seed data:** `NotificationSeeder` (`CommandLineRunner`) seeds three notifications for
  `userId=1` on first startup (a `BUDGET` dining alert, a `PAYMENT` confirmation, a `SYSTEM`
  weekly summary) if none exist.
- **Error handling:** preference toggles are optimistic and revert with a non-blocking
  `prefsError` on failure; `POST /{id}/read` on a non-owned/unknown id returns `404 Not Found`;
  preferences are auto-created with defaults on first `GET` if absent.
