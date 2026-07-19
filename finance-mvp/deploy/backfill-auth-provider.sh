#!/usr/bin/env bash
# Backfills users.auth_provider / users.google_linked_at for accounts that were created via
# Google BEFORE V13 added those columns.
#
# Why a script and not a Flyway migration: the evidence lives in auditdb (audit_events rows with
# action='auth.oauth.register'), and the auth-service migration only has a connection to authdb.
# So V13 defaults every existing row to 'password' and this reconciles them afterwards.
#
# Run ONCE after deploying V13. It is idempotent - re-running changes nothing.
#
#   ./backfill-auth-provider.sh
#
# Requires AUTH_DB_URL and AUDIT_DB_URL (libpq connection strings) in the environment.

set -euo pipefail

: "${AUTH_DB_URL:?set AUTH_DB_URL to the authdb connection string}"
: "${AUDIT_DB_URL:?set AUDIT_DB_URL to the auditdb connection string}"

echo "==> Reading Google registrations from auditdb"

# user_id is VARCHAR in audit_events but holds users.id. Guard against non-numeric junk so a bad
# row can never break the UPDATE below.
mapfile -t ROWS < <(psql "$AUDIT_DB_URL" -At -F'|' -c "
  SELECT user_id, MIN(created_at)
  FROM audit_events
  WHERE action = 'auth.oauth.register'
    AND metadata = 'google'
    AND outcome = 'SUCCESS'
    AND user_id ~ '^[0-9]+$'
  GROUP BY user_id;
")

if [ ${#ROWS[@]} -eq 0 ]; then
  echo "    no Google registrations found in the audit trail - nothing to backfill"
  exit 0
fi

echo "    found ${#ROWS[@]} account(s)"
echo "==> Updating authdb"

for row in "${ROWS[@]}"; do
  uid="${row%%|*}"
  registered_at="${row#*|}"
  # Only touch rows still sitting on the default. If auth_provider is already 'google' this was
  # backfilled before (or created post-V13), and if a real password user somehow shares the id we
  # would rather leave them alone than mislabel the account.
  psql "$AUTH_DB_URL" -q -c "
    UPDATE users
    SET auth_provider    = 'google',
        google_linked_at = COALESCE(google_linked_at, '${registered_at}')
    WHERE id = ${uid}
      AND auth_provider = 'password';
  "
done

echo "==> Done. Current distribution:"
psql "$AUTH_DB_URL" -c "
  SELECT auth_provider,
         COUNT(*)                                      AS users,
         COUNT(google_linked_at)                       AS google_linked
  FROM users
  GROUP BY auth_provider
  ORDER BY auth_provider;
"

echo
echo "NOTE: audit emission is fire-and-forget, so any signup that happened while audit-service"
echo "was down leaves no trace and cannot be recovered. Treat the result as a lower bound."
