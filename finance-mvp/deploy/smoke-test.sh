#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# TerraVest end-to-end smoke test.
# Exercises the new-user happy path through the API gateway and checks every
# core read endpoint + key write paths. Pairs with docs/E2E_TEST_SCENARIOS.md.
#
# Usage:  bash deploy/smoke-test.sh                 # against local gateway :8080
#         GATEWAY=https://app.example.com bash deploy/smoke-test.sh
#
# Exit code 0 = all green. Non-zero = at least one check failed.
# NOTE: run with bash (not zsh) — uses arrays/$RANDOM and avoids zsh's $path trap.
# ---------------------------------------------------------------------------
set -uo pipefail
GATEWAY="${GATEWAY:-http://localhost:8080}"
EMAIL="${EMAIL:-smoke+$(date +%s)-$RANDOM@terravest.test}"
PASS="${PASS:-Demo1234!}"
fail=0
pass=0

jval() { python3 -c "import sys,json;print(json.load(sys.stdin).get('$1',''))" 2>/dev/null; }

# check NAME METHOD PATH EXPECTED [JSON_BODY]
check() {
  local name="$1" method="$2" path="$3" want="$4" body="${5:-}"
  local args=(-s -m 20 -o /dev/null -w "%{http_code}" -X "$method" "$GATEWAY$path"
              -H "Authorization: Bearer ${TOKEN:-}")
  [ -n "$body" ] && args+=(-H "Content-Type: application/json" -d "$body")
  local code; code="$(curl "${args[@]}")"
  if [ "$code" = "$want" ]; then
    printf "  ✅ %-44s %s\n" "$name" "$code"; pass=$((pass+1))
  else
    printf "  ❌ %-44s got %s want %s\n" "$name" "$code" "$want"; fail=$((fail+1))
  fi
}

echo "TerraVest smoke test → $GATEWAY"
echo "user: $EMAIL"
echo

echo "[1] Onboarding & auth"
REG=$(curl -s -m 20 -X POST "$GATEWAY/api/v1/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"firstName\":\"Smoke\",\"lastName\":\"Test\",\"accountType\":\"INDIVIDUAL\",\"mfaChannel\":\"EMAIL\"}")
[ -n "$(echo "$REG" | jval token)" ] && { echo "  ✅ register (auto-login token)"; pass=$((pass+1)); } \
  || { echo "  ❌ register: $REG"; fail=$((fail+1)); }

LOGIN=$(curl -s -m 20 -X POST "$GATEWAY/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
DEVCODE=$(echo "$LOGIN" | jval devCode)
if [ "$(echo "$LOGIN" | jval mfaRequired)" = "True" ] && [ -n "$DEVCODE" ]; then
  echo "  ✅ login → MFA challenge (channel=$(echo "$LOGIN" | jval channel))"; pass=$((pass+1))
else
  echo "  ⚠ login did not require MFA (mfa.enabled=false?) — continuing"
fi

if [ -n "$DEVCODE" ]; then
  VER=$(curl -s -m 20 -X POST "$GATEWAY/api/v1/auth/mfa/verify" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"code\":\"$DEVCODE\"}")
  TOKEN=$(echo "$VER" | jval token)
else
  TOKEN=$(echo "$LOGIN" | jval token)   # mfa disabled path
fi
[ -n "${TOKEN:-}" ] && { echo "  ✅ JWT obtained (len ${#TOKEN})"; pass=$((pass+1)); } \
  || { echo "  ❌ no JWT — aborting"; exit 1; }

# Negative auth checks
NOAUTH=$(curl -s -m 10 -o /dev/null -w "%{http_code}" "$GATEWAY/api/v1/auth/me")
[ "$NOAUTH" = "401" ] || [ "$NOAUTH" = "403" ] && { echo "  ✅ no-token /me rejected ($NOAUTH)"; pass=$((pass+1)); } \
  || { echo "  ❌ no-token /me returned $NOAUTH (want 401/403)"; fail=$((fail+1)); }
DUP=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -X POST "$GATEWAY/api/v1/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
[ "$DUP" = "409" ] && { echo "  ✅ duplicate register → 409"; pass=$((pass+1)); } \
  || { echo "  ❌ duplicate register → $DUP (want 409)"; fail=$((fail+1)); }

echo
echo "[2] Core reads (JWT)"
check "auth/me"              GET "/api/v1/auth/me"                     200
check "net-worth snapshot"  GET "/api/v1/me/snapshot?range=All"       200
check "accounts"            GET "/api/v1/aggregation/accounts"        200
check "transactions"        GET "/api/v1/aggregation/transactions"    200
check "ai/insights"         GET "/api/v1/ai/insights"                 200
check "real-estate list"    GET "/api/v1/real-estate"                 200
check "deals marketplace"   GET "/api/v1/deals/marketplace"           200
check "bill-pay intents"    GET "/api/v1/payments/bill-pay-intents"   200
check "notifications"       GET "/api/v1/notifications"               200
check "notif preferences"   GET "/api/v1/notifications/preferences"   200
check "audit/me"            GET "/api/v1/audit/me?size=5"             200
check "disclaimers"         GET "/api/v1/content/disclaimers"         200
check "planning/goals"      GET "/api/v1/planning/goals"              200
check "debt-scenarios list" GET "/api/v1/planning/debt-scenarios"     200
check "business dashboard"  GET "/api/v1/business/dashboard"          200
check "invest/brokers"      GET "/api/v1/invest/brokers"              200

echo
echo "[3] Key writes & integrations (JWT)"
check "create goal"         POST "/api/v1/planning/goals"             200 '{"name":"Smoke Goal","targetAmount":10000,"currentAmount":1000,"targetDate":"2027-01-01"}'
check "add property"        POST "/api/v1/real-estate"                200 '{"address":"1 Test St","city":"Austin","state":"TX","postalCode":"78701","purchasePrice":300000,"propertyType":"SINGLE_FAMILY"}'
check "update profile"      PUT  "/api/v1/auth/me"                    200 '{"city":"Austin"}'
check "plaid link-token"    POST "/api/v1/aggregation/link-token/create" 200
check "ai/chat (gemini)"    POST "/api/v1/ai/chat"                    200 '{"message":"What is net worth in one sentence?","history":[]}'
check "test notification"   POST "/api/v1/notifications/test"         200

# Debt Lab round-trip: add (with account link) -> update (refresh) -> delete.
# Exercises the import/refresh/remove endpoints added for the linked-accounts feature.
DEBT_ID="$(curl -s -m 20 -X POST "$GATEWAY/api/v1/planning/debt-scenarios/add" \
  -H "Authorization: Bearer ${TOKEN:-}" -H "Content-Type: application/json" \
  -d '{"name":"Smoke Card","balance":1000,"apr":19.99,"minPayment":50,"plaidAccountId":"smoke-acct"}' | jval id)"
if [ -n "$DEBT_ID" ]; then
  printf "  ✅ %-44s %s\n" "add debt (linked)" "id=$DEBT_ID"; pass=$((pass+1))
  check "update debt (refresh)" PUT    "/api/v1/planning/debt-scenarios/$DEBT_ID" 200 '{"name":"Smoke Card","balance":900,"apr":19.99,"minPayment":45,"plaidAccountId":"smoke-acct"}'
  check "compare strategies"    POST   "/api/v1/planning/debt-scenarios"          200 '{"strategy":"AVALANCHE","extra_payment_monthly":300}'
  check "delete debt"           DELETE "/api/v1/planning/debt-scenarios/$DEBT_ID" 204
else
  printf "  ❌ %-44s %s\n" "add debt (linked)" "no id returned"; fail=$((fail+1))
fi

echo
echo "-------------------------------------------"
echo "PASS=$pass  FAIL=$fail"
[ "$fail" -eq 0 ] && echo "ALL GREEN ✅" || echo "FAILURES PRESENT ❌"
exit "$fail"
