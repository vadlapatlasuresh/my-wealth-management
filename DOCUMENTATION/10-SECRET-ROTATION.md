# 10 — How to Rotate a Secret

When you change a provider key (new Plaid secret, new SendGrid key, leaked key, scheduled
rotation), you update it in **one place — the centralized secrets-service store** — then restart
the one service that uses it. Keys are **not** in `.env.prod` anymore (they live encrypted in the
store, unwrapped via GCP KMS), so there's nothing to edit in a file.

> **Where this runs:** on the production VM, in the repo dir
> `/home/deploy/my-wealth-management/finance-mvp`. (Find it reliably with
> `cd "$(docker inspect wealth-secrets-service --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}')"`.)

---

## The 4 steps (any secret)

```bash
cd /home/deploy/my-wealth-management/finance-mvp
git pull   # first time only, to get deploy/rotate-secret.sh

# 1) Push the new value into the store (prompts for the value, hidden — not stored on disk)
bash deploy/rotate-secret.sh <secret-name>

# 2) Restart the consuming service so it re-fetches the new value at boot
#    (the script prints the exact service name + command after a successful rotate)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate <service>

# 3) Verify the feature works in the app (e.g. link a bank, send a code)

# 4) Revoke the OLD key in the provider's dashboard (Plaid/SendGrid/etc.)
```

That's it. The store keeps the previous version (marked PREVIOUS) and the change is recorded in
the tamper-evident audit chain, so rotations are auditable and reversible.

---

## Secret names → which service restarts

| Secret name(s) | Consuming service to restart |
|---|---|
| `plaid.client_id`, `plaid.secret` | `account-aggregation-service` |
| `sendgrid.api_key`, `sendgrid.from`, `twilio.*`, `fcm.server_key` | `notification-service` |
| `gemini.api_key`, `anthropic.api_key`, `openai.api_key` | `ai-insights-service` |
| `stripe.secret_key`, `stripe.webhook_secret` | `payment-service` |
| `realestate.provider_api_key` | `real-estate-service` |
| `qbo.client_id`, `qbo.client_secret` | `business-financials-service` |
| `jwt.secret`, `app.encryption_key`, `audit.ingest_key` | shared — restart all (these also still live in `.env.prod` as the bootstrap layer) |

---

## Example: rotate the Plaid secret (and/or client_id)

```bash
cd /home/deploy/my-wealth-management/finance-mvp
git pull

bash deploy/rotate-secret.sh plaid.secret        # paste the NEW secret when prompted
# (only if the client_id also changed:)
bash deploy/rotate-secret.sh plaid.client_id      # paste the NEW client_id

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --force-recreate account-aggregation-service
sleep 60
# confirm it loaded from the store (not a fetch-failed fallback):
docker logs wealth-account-aggregation-service 2>&1 | grep -iE "loaded .* scope 'plaid'|fetch failed" | tail -2
# then link a bank in the app to confirm the new key works, and revoke the old key in Plaid.
```

---

## Notes
- **Zero-downtime:** create the new key in the provider FIRST, rotate it here, restart the consumer,
  confirm it works, *then* revoke the old key in the provider. The old key stays valid during the swap.
- **No retries on the client:** the secrets-client fetches once at boot, so a rotation isn't picked
  up until you restart the consumer (step 2). That's why the restart is required.
- **Bootstrap secrets** (`jwt.secret`, `app.encryption_key`, `audit.ingest_key`) also live in
  `.env.prod`; to rotate those, update `.env.prod` too and redeploy the affected services.
- **Mechanics / admin API** (the raw `POST /admin/secrets/{name}/rotate` the script calls) are in
  [../finance-mvp/docs/SECRETS_HOWTO.md](../finance-mvp/docs/SECRETS_HOWTO.md) §3.
