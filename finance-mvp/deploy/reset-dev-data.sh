#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# reset-dev-data.sh — wipe MEMBER data so you can sign up fresh. DEV ONLY.
#
# Why this exists: member rows are scoped by user_id across ~10 service databases. If the
# auth database is ever recreated on its own, the new account gets a NEW user id while every
# account/transaction row still points at the OLD one — so the app correctly shows "no data"
# even though the rows are right there. This script clears member data everywhere at once so a
# fresh signup starts clean and consistent.
#
# WHAT IT DELETES  member/user data: accounts, transactions, holdings, goals, budgets, debts,
#                  properties, businesses, invoices, documents, notifications, insights,
#                  subscriptions, bill-pay intents, households, audit events, and the users
#                  themselves.
#
# WHAT IT KEEPS    things that would BREAK the app or lock you out if wiped:
#                    * secretsdb                — encryption keys. auth-service crash-loops
#                                                 with "APP_ENCRYPTION_KEY is not set" without
#                                                 them. NEVER TOUCHED.
#                    * app_section/app_module/  — the config-driven navigation. Truncating it
#                      feature_flag/app_setting   would empty the sidebar, and Flyway will NOT
#                                                 re-seed it because flyway_schema_history
#                                                 persists.
#                    * ops_users / ops_roles /  — staff accounts + RBAC. Wiping locks you out
#                      ops_permissions / …        of the Ops Portal.
#                    * subscription_plan /      — the plan catalog + per-tier feature flags.
#                      plan_feature
#                    * ops_finance_config
#                    * flyway_schema_history    — wiping it makes migrations re-run and fail.
#
# USAGE
#   bash deploy/reset-dev-data.sh --dry-run     # show what WOULD be cleared (default-safe)
#   bash deploy/reset-dev-data.sh               # interactive, requires typing RESET
#   bash deploy/reset-dev-data.sh --force       # no prompt (CI/scripted)
#
# CONNECTION (override as needed)
#   PGHOST=localhost PGPORT=5432 PGUSER=wealth PGPASSWORD=wealth bash deploy/reset-dev-data.sh
#
# ON THE VM: Postgres is published on 127.0.0.1:5432 only, so run this ON the VM (ssh in).
# If psql isn't installed on the host, run it through the container instead:
#   docker exec -i wealth-postgres bash -s < deploy/reset-dev-data.sh --dry-run
# or install the client:  sudo apt-get install -y postgresql-client
# The correct password is POSTGRES_PASSWORD from .env.prod.
# ---------------------------------------------------------------------------
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-wealth}"
export PGPASSWORD="${PGPASSWORD:-wealth}"

DRY_RUN=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

psql_q() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$1" -tAc "$2" 2>/dev/null; }
db_exists() { psql_q postgres "SELECT 1 FROM pg_database WHERE datname='$1'" | grep -q 1; }

# --- Resolve the naming scheme -------------------------------------------------
# The VM (deploy/init-databases.sql) uses short names; start-local.sh uses long ones.
if db_exists authdb; then
  SCHEME="vm"
  DB_AUTH=authdb; DB_AGG=aggdb; DB_CORE=coredb; DB_RE=redb; DB_BIZ=bizdb
  DB_AI=aidb; DB_PAY=paydb; DB_NOTIF=notifdb; DB_CONFIG=configdb; DB_AUDIT=auditdb; DB_DOCS=documentsdb
elif db_exists auth_db; then
  SCHEME="local"
  DB_AUTH=auth_db; DB_AGG=account_aggregation_db; DB_CORE=financial_core_db; DB_RE=real_estate_db
  DB_BIZ=business_financials_db; DB_AI=ai_insights_db; DB_PAY=payment_db; DB_NOTIF=notification_db
  DB_CONFIG=platform_config_db; DB_AUDIT=audit_db; DB_DOCS=documents_db
else
  echo "ERROR: found neither 'authdb' (VM) nor 'auth_db' (local) on $PGHOST:$PGPORT as '$PGUSER'." >&2
  echo "       Check PGHOST/PGUSER/PGPASSWORD." >&2
  exit 1
fi

# --- What gets cleared, per database -------------------------------------------
# Only tables listed here are touched. Anything not listed survives by construction.
TABLES_AUTH="users user_roles user_deletion_task household household_member household_invite \
household_goal household_goal_contribution household_bill household_bill_payment household_share \
ops_customer_notes ops_escalations ops_verification_attempts ops_verification_sessions"
TABLES_AGG="accounts transactions holdings investment_transactions plaid_items category_rule"
TABLES_CORE="goals goal_contributions goal_account_links budgets budget_lines debts debt_scenarios \
net_worth_snapshots tax_profile tax_estimate_snapshot cpa_connection cpa_profile cpa_review \
alt_investments broker_accounts"
TABLES_RE="properties property_expenses deals deal_documents deal_images deal_interests deal_watches \
private_holdings private_holding_entries sponsor_projects"
TABLES_BIZ="manual_businesses business_accounts business_budgets business_documents business_expenses \
business_expense_links business_goals business_invoices business_linked_accounts business_transactions \
business_vendors qbo_connections reconciled_transactions transaction_overrides"
TABLES_AI="insights"
TABLES_PAY="user_subscription bill_pay_intents ledger_entries ops_adjustments ops_anomalies"
TABLES_NOTIF="notifications notification_preferences device_token notification_idempotency"
TABLES_DOCS="documents doc_folders document_shares share_documents share_access_log"
TABLES_AUDIT="audit_events audit_checkpoints"
TABLES_CONFIG="disclaimer_acceptance"   # ONLY acceptances; the nav/config seed stays.

# Tables that must still have rows afterwards — verified at the end.
declare -a KEEP_CHECKS=(
  "$DB_CONFIG:app_module" "$DB_CONFIG:app_section" "$DB_PAY:subscription_plan" "$DB_PAY:plan_feature"
)

echo "──────────────────────────────────────────────────────────────"
echo " TerraVest dev data reset"
echo " host=$PGHOST:$PGPORT user=$PGUSER scheme=$SCHEME"
echo "──────────────────────────────────────────────────────────────"
echo " KEEPS: secretsdb (encryption keys), nav config, ops staff/RBAC,"
echo "        plan catalog, flyway history"
echo

# Which of the wanted tables actually exist in this database (echoed space-separated).
present_tables() {
  local db="$1"; shift
  local out=""
  for t in "$@"; do
    if [ "$(psql_q "$db" "SELECT to_regclass('public.$t') IS NOT NULL")" = "t" ]; then out="$out $t"; fi
  done
  echo "$out"
}

# SURVEY ONLY — never deletes. Prints how much member data each database holds.
survey_db() {
  local db="$1"; shift
  db_exists "$db" || { printf "  %-26s (absent, skipped)\n" "$db"; return; }
  local present; present=$(present_tables "$db" "$@")
  if [ -z "$present" ]; then printf "  %-26s (no matching tables)\n" "$db"; return; fi

  local total=0 n
  for t in $present; do
    n=$(psql_q "$db" "SELECT count(*) FROM $t"); total=$(( total + ${n:-0} ))
  done
  printf "  %-26s %2d tables, %6s rows\n" "$db" "$(echo $present | wc -w | tr -d ' ')" "$total"
}

# APPLY — the only function that deletes anything. Called strictly after consent.
apply_db() {
  local db="$1"; shift
  db_exists "$db" || return 0
  local present; present=$(present_tables "$db" "$@")
  [ -n "$present" ] || return 0
  local list; list=$(echo $present | sed 's/\([a-z_][a-z_]*\)/public.\1/g; s/ /, /g')
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$db" -v ON_ERROR_STOP=1 \
    -c "TRUNCATE $list RESTART IDENTITY CASCADE;" >/dev/null
  printf "  cleared %s\n" "$db"
}

# ---- Phase 1: SURVEY. Nothing is deleted here, so the prompt below is informed.
echo "Member data that WILL be cleared:"
survey_db "$DB_AUTH"   $TABLES_AUTH
survey_db "$DB_AGG"    $TABLES_AGG
survey_db "$DB_CORE"   $TABLES_CORE
survey_db "$DB_RE"     $TABLES_RE
survey_db "$DB_BIZ"    $TABLES_BIZ
survey_db "$DB_AI"     $TABLES_AI
survey_db "$DB_PAY"    $TABLES_PAY
survey_db "$DB_NOTIF"  $TABLES_NOTIF
survey_db "$DB_DOCS"   $TABLES_DOCS
survey_db "$DB_AUDIT"  $TABLES_AUDIT
survey_db "$DB_CONFIG" $TABLES_CONFIG

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "DRY RUN — nothing was deleted. Re-run without --dry-run to apply."
  exit 0
fi

# ---- Phase 2: CONSENT.
if [ "$FORCE" -eq 0 ]; then
  echo
  read -r -p "Type RESET to permanently delete the above: " reply
  [ "$reply" = "RESET" ] || { echo "Aborted — nothing was deleted."; exit 1; }
fi

# ---- Phase 3: APPLY. First deletion happens here, never before.
echo
echo "Clearing…"
apply_db "$DB_AUTH"   $TABLES_AUTH
apply_db "$DB_AGG"    $TABLES_AGG
apply_db "$DB_CORE"   $TABLES_CORE
apply_db "$DB_RE"     $TABLES_RE
apply_db "$DB_BIZ"    $TABLES_BIZ
apply_db "$DB_AI"     $TABLES_AI
apply_db "$DB_PAY"    $TABLES_PAY
apply_db "$DB_NOTIF"  $TABLES_NOTIF
apply_db "$DB_DOCS"   $TABLES_DOCS
apply_db "$DB_AUDIT"  $TABLES_AUDIT
apply_db "$DB_CONFIG" $TABLES_CONFIG

# --- Safety net: prove we did not wipe something that locks the app -------------
echo
echo "Verifying protected config survived:"
fail=0
for check in "${KEEP_CHECKS[@]}"; do
  db="${check%%:*}"; tbl="${check##*:}"
  db_exists "$db" || continue
  [ "$(psql_q "$db" "SELECT to_regclass('public.$tbl') IS NOT NULL")" = "t" ] || continue
  n=$(psql_q "$db" "SELECT count(*) FROM $tbl")
  if [ "${n:-0}" -gt 0 ]; then printf "  ✓ %s.%s (%s rows)\n" "$db" "$tbl" "$n"
  else printf "  ✗ %s.%s is EMPTY — the app's nav or plans will be broken!\n" "$db" "$tbl"; fail=1; fi
done
secret_note="untouched"
db_exists secretsdb && secret_note="untouched ($(psql_q secretsdb "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'") tables)"
echo "  ✓ secretsdb $secret_note"

echo
if [ "$fail" -eq 1 ]; then
  echo "⚠  Protected config was emptied. Restore it before using the app:"
  echo "   re-run the platform-config / payment migrations, or restore from backup."
  exit 1
fi

cat <<'DONE'
✅ Member data cleared. Next steps:

  1. Restart the services so nothing serves cached member state:
        docker compose -f docker-compose.prod.yml restart      # VM
        bash deploy/start-local.sh                             # local

  2. Sign up fresh in the app. The new account gets user id 1 again, and every
     service will agree on it — which is the whole point of clearing them together.

  3. Link a Plaid sandbox account, then open Today / Cash Flow / Spending.

  NOTE: secrets were NOT touched. If you ever recreate secretsdb itself, re-run
        deploy/seed-secrets.sh or auth-service will crash-loop on APP_ENCRYPTION_KEY.
DONE
