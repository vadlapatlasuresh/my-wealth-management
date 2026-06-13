#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load real secret values into the centralized secrets-service.
#
# Reads each value straight from .env.prod (the secret name maps 1:1 to its
# ENV-var name, e.g. gemini.api_key <- GEMINI_API_KEY), so there's nothing to
# type. Idempotent: re-running just rotates to the current value. Empty vars
# are skipped (their placeholder stays in the store).
#
# Run ON THE VM, from the finance-mvp dir, AFTER the stack (incl. secrets-service)
# is up:   bash deploy/seed-secrets.sh
#
# Reaches the internal-only secrets-service over the compose network via a
# throwaway curl container — nothing is exposed publicly.
# ---------------------------------------------------------------------------
set -euo pipefail
ENV_FILE="${ENV_FILE:-.env.prod}"
SVC_CONTAINER="${SVC_CONTAINER:-wealth-secrets-service}"
SVC_URL="http://secrets-service:8080"

[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found (run from finance-mvp/)"; exit 1; }

# secret-name : ENV-var  (inverse of the client's UPPER_SNAKE mapping)
PAIRS=(
  jwt.secret:JWT_SECRET
  app.encryption_key:APP_ENCRYPTION_KEY
  audit.ingest_key:AUDIT_INGEST_KEY
  notifications.internal_key:NOTIFICATIONS_INTERNAL_KEY
  plaid.client_id:PLAID_CLIENT_ID
  plaid.secret:PLAID_SECRET
  stripe.secret_key:STRIPE_SECRET_KEY
  stripe.webhook_secret:STRIPE_WEBHOOK_SECRET
  sendgrid.api_key:SENDGRID_API_KEY
  sendgrid.from:SENDGRID_FROM
  twilio.account_sid:TWILIO_ACCOUNT_SID
  twilio.auth_token:TWILIO_AUTH_TOKEN
  twilio.from:TWILIO_FROM
  fcm.server_key:FCM_SERVER_KEY
  qbo.client_id:QBO_CLIENT_ID
  qbo.client_secret:QBO_CLIENT_SECRET
  gemini.api_key:GEMINI_API_KEY
  anthropic.api_key:ANTHROPIC_API_KEY
  openai.api_key:OPENAI_API_KEY
  realestate.provider_api_key:REALESTATE_PROVIDER_API_KEY
)

# Read a single key from the env file WITHOUT sourcing it (values may contain
# spaces, e.g. JVM_OPTS=-XX:+UseSerialGC ..., which `source` would try to execute).
getenv() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r'; }

# Network the secrets-service is attached to.
NET=$(docker inspect "$SVC_CONTAINER" -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null) \
  || { echo "ERROR: $SVC_CONTAINER not running"; exit 1; }
echo "secrets-service network: $NET"

# Mint a short-lived ADMIN JWT from the shared JWT_SECRET.
JWT_SECRET=$(getenv JWT_SECRET)
[ -n "$JWT_SECRET" ] || { echo "ERROR: JWT_SECRET not found in $ENV_FILE"; exit 1; }
ADMIN_JWT=$(python3 - "$JWT_SECRET" <<'PY'
import sys,hmac,hashlib,base64,json,time
s=sys.argv[1].encode(); b=lambda x: base64.urlsafe_b64encode(x).rstrip(b'=')
h=b(json.dumps({"alg":"HS256","typ":"JWT"},separators=(',',':')).encode()); n=int(time.time())
p=b(json.dumps({"sub":"1","roles":["ADMIN"],"iat":n,"exp":n+3600},separators=(',',':')).encode())
print((h+b'.'+p+b'.'+b(hmac.new(s,h+b'.'+p,hashlib.sha256).digest())).decode())
PY
)

api() { docker run --rm --network "$NET" curlimages/curl -s "$@"; }

echo "Loading secrets into the store…"
set=0; skip=0
for pair in "${PAIRS[@]}"; do
  name=${pair%%:*}; var=${pair##*:}
  val=$(getenv "$var")
  if [ -z "${val:-}" ]; then echo "  skip  $name (no $var)"; skip=$((skip+1)); continue; fi
  body=$(python3 -c 'import json,sys;print(json.dumps({"value":sys.argv[1]}))' "$val")
  code=$(api -o /dev/null -w '%{http_code}' -X POST "$SVC_URL/admin/secrets/$name/rotate" \
          -H "Authorization: Bearer $ADMIN_JWT" -H 'Content-Type: application/json' -d "$body")
  echo "  set   $name <- $var  ($code)"; set=$((set+1))
done

echo "Done: $set set, $skip skipped."
echo "Verify (metadata only, no values):"
api "$SVC_URL/admin/secrets" -H "Authorization: Bearer $ADMIN_JWT" \
  | python3 -c 'import sys,json;[print("  ",x["name"],x["status"],"v"+str(x["activeVersion"])) for x in json.load(sys.stdin)]' 2>/dev/null \
  || echo "  (listing failed — check ADMIN_JWT / service health)"
