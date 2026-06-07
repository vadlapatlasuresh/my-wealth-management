# Phase 7 — Notification Service ✅ DONE (mock provider)

> **Status:** Built and live. `notification-service` (:8088) at `/api/v1/notifications`
> (list, preferences GET/PUT, test, mark-read); `ProfilePage` preference toggles persist; 3
> notifications seeded for userId 1. Uses `MockNotificationProvider` (logs + records). Set
> `SENDGRID_API_KEY`/`FCM_SERVER_KEY` and implement real channels to go live. Checklist kept.


**Goal:** Centralized email + push notifications (budget alerts, bill due, large transaction,
payment status, weekly summary).

## Backend
- [ ] Scaffold `apps/notification-service` (Spring Boot, Java 17), port **8088**.
- [ ] Channels: email (SendGrid/SES), push (FCM/APNs or web push). Provider behind an interface.
- [ ] Event-driven: subscribe to domain events (budget exceeded, payment succeeded/failed,
      account sync error). Start with a simple in-process event bus or scheduled scans; move to a
      broker (Kafka/Rabbit) in Phase 9 if needed.
- [ ] Entities: `NotificationPreference` (per user/channel/type), `NotificationLog`.
- [ ] Endpoints (`/api/v1/notifications`): `GET /` (history), `GET /preferences`,
      `PUT /preferences`, `POST /test`.
- [ ] Gateway route `/api/v1/notifications/**` → 8088.

## Frontend
- [ ] Profile/Settings "Preferences" toggles (already built with `.toggle`) → persist to
      `PUT /preferences`.
- [ ] Topbar bell (`icon-btn` with `.dot`) → notification dropdown from `GET /`.

## Env / keys
- [ ] `SENDGRID_API_KEY` / SES creds; `FCM_SERVER_KEY` / VAPID keys for web push.

## Acceptance criteria
- [ ] Toggling a preference persists and is honored.
- [ ] A budget-exceeded / payment event produces an email (and push if enabled) + a log entry.
