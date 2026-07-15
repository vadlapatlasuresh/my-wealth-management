#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-time local Postgres setup for TerraVest dev (idempotent).
# Creates the `wealth` role and one database per DB-backed service.
#
#   brew install postgresql@16 && brew services start postgresql@16
#   bash deploy/init-local-db.sh
#   bash deploy/start-local.sh        # then run the stack on Postgres
# ---------------------------------------------------------------------------
set -uo pipefail
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

echo "Waiting for Postgres…"
for i in $(seq 1 20); do pg_isready -h localhost -p 5432 >/dev/null 2>&1 && break; sleep 1; done

psql -h localhost -d postgres -v ON_ERROR_STOP=0 >/dev/null 2>&1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='wealth') THEN
    CREATE ROLE wealth LOGIN PASSWORD 'wealth' CREATEDB;
  END IF;
END $$;
SQL
echo "role 'wealth' ready"

for db in auth financial_core account_aggregation real_estate business_financials \
          ai_insights payment notification platform_config audit documents; do
  createdb -h localhost -O wealth "${db}_db" 2>/dev/null && echo "created ${db}_db" || echo "${db}_db exists"
done
echo "Done. Each service owns its own database (separate Flyway history)."
