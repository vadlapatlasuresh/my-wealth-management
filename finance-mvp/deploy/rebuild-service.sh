#!/usr/bin/env bash
# ============================================================
#  rebuild-service.sh — rebuild ONE service from current source and restart just
#  that container. Run ON the VM from anywhere in the repo.
#
#  Why this exists: there is no CI image pipeline here. Merging to main does NOT
#  deploy — `deploy.sh` rebuilds the web bundle and PULLS Java images, but the
#  Java images themselves are built locally by build-all.sh. So after a backend
#  change merges, the running container keeps the OLD image until you rebuild it.
#  This script does the minimal rebuild for a single service.
#
#  It builds at the tag the stack is ALREADY using (the TAG in .env.prod), so the
#  freshly built local image replaces what compose references — no other service
#  is touched, and you don't have to rebuild all 11 images.
#
#  Usage (on the VM):
#    bash deploy/rebuild-service.sh financial-core-service     # rebuild + restart one Java service
#    bash deploy/rebuild-service.sh web                        # rebuild the web bundle (delegates to deploy.sh)
#    bash deploy/rebuild-service.sh financial-core-service --no-pull   # skip the git pull
#
#  By default it first runs `git pull --ff-only origin main`. Pass --no-pull to
#  build exactly what's checked out.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # -> finance-mvp/

ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file $ENV_FILE"

# Java services that run in docker-compose.prod.yml (kept in sync with build-all.sh).
SERVICES=(
  api-gateway
  auth-service
  account-aggregation-service
  financial-core-service
  real-estate-service
  business-financials-service
  ai-insights-service
  payment-service
  notification-service
  platform-config-service
  audit-service
)

usage() {
  echo "Usage: bash deploy/rebuild-service.sh <service|web> [--no-pull]"
  echo
  echo "  web                 rebuild the web bundle (runs deploy.sh)"
  echo "  <service>           one of:"
  printf '                        %s\n' "${SERVICES[@]}"
  exit "${1:-0}"
}

SERVICE=""
DO_PULL=1
for arg in "$@"; do
  case "$arg" in
    -h|--help) usage 0 ;;
    --no-pull) DO_PULL=0 ;;
    -*) echo "Unknown flag: $arg"; usage 1 ;;
    *) SERVICE="$arg" ;;
  esac
done
[ -n "$SERVICE" ] || usage 1

# Optional: fast-forward to the latest main before building.
if [ "$DO_PULL" -eq 1 ]; then
  echo "==> git pull --ff-only origin main"
  git pull --ff-only origin main || echo "    (pull skipped/failed — building current checkout)"
fi

# Web is a special case — it's not a Java image; deploy.sh rebuilds + recreates it.
if [ "$SERVICE" = "web" ]; then
  echo "==> Rebuilding the web bundle via deploy.sh"
  exec bash deploy/deploy.sh
fi

# Validate the service name.
found=0
for s in "${SERVICES[@]}"; do [ "$s" = "$SERVICE" ] && found=1; done
[ "$found" -eq 1 ] || { echo "ERROR: unknown service '$SERVICE'"; usage 1; }

OWNER=$(grep '^GHCR_OWNER=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r')
[ -n "$OWNER" ] || { echo "ERROR: GHCR_OWNER not found in $ENV_FILE"; exit 1; }
TAG=$(grep '^TAG=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r')
TAG="${TAG:-latest}"   # compose defaults to :latest when TAG is unset
IMAGE="ghcr.io/$OWNER/wealth-$SERVICE:$TAG"

echo "==> Building $SERVICE  ->  $IMAGE"
docker build -f Dockerfile.java-service --build-arg SERVICE="$SERVICE" -t "$IMAGE" .

echo "==> Recreating the $SERVICE container (others untouched)"
$COMPOSE up -d --force-recreate --no-deps "$SERVICE"

echo "==> Done. Recent logs:"
docker logs --tail 20 "wealth-$SERVICE" 2>&1 || true
echo
echo "    Tip: check Flyway ran any new migrations with:"
echo "      docker logs wealth-$SERVICE 2>&1 | grep -i 'Successfully applied\\|Migrating schema'"
