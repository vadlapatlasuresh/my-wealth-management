#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Start the full TerraVest backend locally against a PERSISTENT local Postgres
# (so data survives restarts — no more in-memory H2 resets).
#
# Prereqs (one-time):
#   brew install postgresql@16 && brew services start postgresql@16
#   createuser/createdb handled by deploy/init-local-db.sh
#
# Usage:  bash deploy/start-local.sh           # build skipped if jars exist
#         REBUILD=1 bash deploy/start-local.sh # mvn package first
# Logs:   /tmp/svc-<name>.log
# ---------------------------------------------------------------------------
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

JAVA="${JAVA:-/opt/homebrew/opt/openjdk@17/bin/java}"
[ -x "$JAVA" ] || JAVA="java"
PGHOST="localhost:5432"; PGUSER="wealth"; PGPASS="wealth"

# Load local provider secrets (gitignored), e.g. PLAID_CLIENT_ID/PLAID_SECRET,
# so services pick them up instead of falling back to mock providers.
if [ -f "$ROOT/.env.local" ]; then
  set -a; . "$ROOT/.env.local"; set +a
  echo "loaded .env.local (PLAID_ENV=${PLAID_ENV:-unset})"
fi

pgargs() { # $1 = db name
  # Cap the Hikari pool: 10 services * 5 = 50 connections, well under Postgres'
  # default max_connections (100). Default (10 each) would exhaust the server.
  printf -- '--spring.datasource.url=jdbc:postgresql://%s/%s --spring.datasource.username=%s --spring.datasource.password=%s --spring.datasource.driver-class-name=org.postgresql.Driver --spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect --spring.datasource.hikari.maximum-pool-size=5 --spring.datasource.hikari.minimum-idle=1' \
    "$PGHOST" "$1" "$PGUSER" "$PGPASS"
}

start() { # name port [db]
  local name="$1" port="$2" db="${3:-}"
  local jar="apps/$name/target/$name-0.0.1-SNAPSHOT.jar"
  if [ ! -f "$jar" ]; then echo "  ! $name: jar missing (run with REBUILD=1)"; return; fi
  local pid; pid="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1)"
  [ -n "$pid" ] && kill "$pid" 2>/dev/null
  local extra=""; [ -n "$db" ] && extra="$(pgargs "$db")"
  # shellcheck disable=SC2086
  nohup "$JAVA" -jar "$jar" --spring.profiles.active=dev $extra >"/tmp/svc-$name.log" 2>&1 &
  echo "  started $name on $port ${db:+(db=$db)}"
}

if [ "${REBUILD:-0}" = "1" ]; then
  echo "Building all services (skip tests)…"
  # No aggregator POM at repo root — each service is its own Maven project, so
  # build them one by one from apps/<svc>/pom.xml.
  for svc in api-gateway auth-service account-aggregation-service financial-core-service \
             real-estate-service business-financials-service ai-insights-service \
             payment-service notification-service platform-config-service audit-service; do
    echo "  building $svc…"
    mvn -q -f "apps/$svc/pom.xml" clean package -DskipTests || { echo "build failed: $svc"; exit 1; }
  done
fi

echo "Stopping any running services…"
for p in 8080 8081 8082 8083 8084 8085 8086 8087 8088 8089 8090; do
  pid="$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null | head -1)"; [ -n "$pid" ] && kill "$pid" 2>/dev/null
done
sleep 3

echo "Starting services on Postgres…"
start api-gateway                  8080            # no DB
start auth-service                 8081 auth_db
start account-aggregation-service  8082 account_aggregation_db
start financial-core-service       8083 financial_core_db
start real-estate-service          8084 real_estate_db
start business-financials-service  8085 business_financials_db
start ai-insights-service          8086 ai_insights_db
start payment-service              8087 payment_db
start notification-service         8088 notification_db
start platform-config-service      8089 platform_config_db
start audit-service                8090 audit_db

echo "Waiting for boot…"; sleep 45
up=0; for p in 8080 8081 8082 8083 8084 8085 8086 8087 8088 8089 8090; do
  [ -n "$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null)" ] && up=$((up+1))
done
echo "$up/11 services up. Logs in /tmp/svc-*.log"
