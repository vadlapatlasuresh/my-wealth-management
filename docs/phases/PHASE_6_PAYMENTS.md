# Phase 6 — Payment Processing Service (Stripe bill pay) ✅ DONE (mock provider)

> **Status:** Built and live. `payment-service` (:8087) at `/api/v1/payments` (list/create/get
> bill-pay-intents + public webhook); `BillPayPage` works end-to-end. Uses `MockPaymentProvider`
> (settles immediately). Set `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` and implement the real
> `PaymentProvider` (Stripe PaymentIntents) + webhook signature verification to go live. Checklist kept.


**Goal:** Replace mock `/v1/payments/bill-pay-intents` and make `BillPayPage` execute real
(test-mode) payments via Stripe.

## Backend
- [ ] Scaffold `apps/payment-service` (Spring Boot, Java 17), port **8087**.
- [ ] Stripe integration (test keys): create PaymentIntents, confirm, handle webhooks
      (`payment_intent.succeeded/failed`).
- [ ] Entities: `BillPayIntent` (id, userId, fromAccount, payee, amount, status, stripeId, createdAt).
- [ ] Endpoints (`/api/v1/payments`): `GET /bill-pay-intents`, `POST /bill-pay-intents`,
      `GET /bill-pay-intents/{id}`, `POST /webhook` (public, signature-verified).
- [ ] Gateway route `/api/v1/payments/**` → 8087; retire legacy `/v1/payments/*` mock.

## Frontend
- [ ] `BillPayPage.jsx` (theme-compliant, stepper already present) → real intent create/confirm,
      live status; success screen shows real intent id.
- [ ] `api.js`: point `getPaymentIntents` / `createBillPayIntent` to `/api/v1/payments`.

## Env / keys
- [ ] `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, publishable key for the client if needed.

## Acceptance criteria
- [ ] Submitting bill pay creates a real test PaymentIntent; status transitions via webhook.
- [ ] Idempotency on create; amounts validated; data scoped to JWT user.
