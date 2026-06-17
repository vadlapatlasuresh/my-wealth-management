#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Rotate ONE secret in the centralized secrets-service store.
#
# Usage (on the VM, from the repo dir):
#   bash deploy/rotate-secret.sh <secret-name>
#   e.g.  bash deploy/rotate-secret.sh plaid.secret
#
# Prompts for the new value WITHOUT echoing it (so it never lands in shell
# history or a file), pushes it as a new ACTIVE version into the store (the old
# version becomes PREVIOUS, auditable), and prints the service to restart so it
# picks up the new value (the secrets-client fetches once, at boot).
#
# The value is sent over the internal compose network to the (internal-only)
# secrets-service via a throwaway curl container — never exposed publicly.
# ---------------------------------------------------------------------------
set -euo pipefail
ENV_FILE="${ENV_FILE:-.env.prod}"
SVC_CONTAINER="${SVC_CONTAINER:-wealth-secrets-service}"
SVC_URL="http://secrets-service:8080"

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "usage: bash deploy/rotate-secret.sh <secret-name>"
  echo "names: plaid.client_id plaid.secret sendgrid.api_key sendgrid.from twilio.account_sid"
  echo "       twilio.auth_token twilio.from stripe.secret_key stripe.webhook_secret gemini.api_key"
  echo "       anthropic.api_key openai.api_key qbo.client_id qbo.client_secret fcm.server_key"
  echo "       realestate.provider_api_key jwt.secret app.encryption_key audit.ingest_key"
  exit 1
fi
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found — run from the repo dir"; exit 1; }

getenv() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r'; }

# Prompt for the new value (hidden).
printf "New value for '%s' (input hidden): " "$NAME" >&2
read -rs NEW_VALUE; echo >&2
[ -n "$NEW_VALUE" ] || { echo "ERROR: empty value, aborting"; exit 1; }

# Mint a short-lived ADMIN JWT from the shared JWT_SECRET.
JWT_SECRET=$(getenv JWT_SECRET)
[ -n "$JWT_SECRET" ] || { echo "ERROR: JWT_SECRET not found in $ENV_FILE"; exit 1; }
ADMIN_JWT=$(JS="$JWT_SECRET" python3 <<'PY'
import os,hmac,hashlib,base64,json,time
s=os.environ["JS"].encode(); b=lambda x: base64.urlsafe_b64encode(x).rstrip(b'=')
h=b(json.dumps({"alg":"HS256","typ":"JWT"},separators=(',',':')).encode()); n=int(time.time())
p=b(json.dumps({"sub":"1","roles":["ADMIN"],"iat":n,"exp":n+3600},separators=(',',':')).encode())
print((h+b'.'+p+b'.'+b(hmac.new(s,h+b'.'+p,hashlib.sha256).digest())).decode())
PY
)

NET=$(docker inspect "$SVC_CONTAINER" -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}') \
  || { echo "ERROR: $SVC_CONTAINER not running"; exit 1; }

# Build the JSON body and POST it via stdin (keeps the secret out of process args).
BODY=$(NV="$NEW_VALUE" python3 -c 'import json,os;print(json.dumps({"value":os.environ["NV"]}))')
CODE=$(printf '%s' "$BODY" | docker run --rm -i --network "$NET" curlimages/curl -s -o /dev/null -w '%{http_code}' \
        -X POST "$SVC_URL/admin/secrets/$NAME/rotate" \
        -H "Authorization: Bearer $ADMIN_JWT" -H 'Content-Type: application/json' --data-binary @-)

if [ "$CODE" != "200" ]; then
  echo "✗ rotate failed (HTTP $CODE). Check the secret name is exact and secrets-service is healthy."
  exit 1
fi
echo "✓ rotated '$NAME' — new ACTIVE version stored (old kept as PREVIOUS, audited)."

# Which service consumes this scope → restart it to pick up the new value at boot.
scope="${NAME%%.*}"
case "$scope" in
  plaid)        svc="account-aggregation-service" ;;
  sendgrid|twilio|fcm|notifications) svc="notification-service" ;;
  gemini|anthropic|openai) svc="ai-insights-service" ;;
  stripe)       svc="payment-service" ;;
  realestate)   svc="real-estate-service" ;;
  qbo)          svc="business-financials-service" ;;
  jwt|app|audit) svc="(shared — restart the affected services)" ;;
  *)            svc="(the consuming service)" ;;
esac
echo
echo "Next: restart the consumer so it re-fetches:"
echo "  docker compose -f docker-compose.prod.yml --env-file $ENV_FILE up -d --force-recreate $svc"
echo "Then verify the feature works, and revoke the OLD key in the provider's dashboard."
