#!/usr/bin/env bash
# ============================================================
#  build-all.sh — build every wealth-* service image locally (there is no CI
#  image pipeline; deploy.sh only PULLS). Run ON the VM from finance-mvp/.
#
#  Tags each image exactly as docker-compose.prod.yml expects
#  (ghcr.io/$GHCR_OWNER/wealth-<svc>:<TAG>) so `docker compose up -d` uses the
#  freshly built LOCAL image without pulling the stale GHCR one.
#
#  Usage (on the VM):
#    bash deploy/build-all.sh                 # tag = git short SHA (recommended)
#    TAG=mytag bash deploy/build-all.sh       # explicit tag
#
#  This script SETS TAG=<this build> in .env.prod for you, so just redeploy:
#    bash deploy/deploy.sh
#  (or, backend-only: docker compose -f docker-compose.prod.yml --env-file .env.prod up -d)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # -> finance-mvp/
ENV_FILE="${ENV_FILE:-.env.prod}"

OWNER=$(grep '^GHCR_OWNER=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r')
[ -n "$OWNER" ] || { echo "ERROR: GHCR_OWNER not found in $ENV_FILE"; exit 1; }
TAG="${TAG:-$(git rev-parse --short HEAD)}"

# Every Java service that runs in docker-compose.prod.yml (secrets-service is the
# store itself and is already current; integrator-java is not deployed).
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
  documents-service
)

echo "==> Building ${#SERVICES[@]} images  owner=$OWNER  tag=$TAG"
echo "    (sequential to stay within VM memory; ~2-4 min each)"
i=0
for svc in "${SERVICES[@]}"; do
  i=$((i+1))
  echo "==> [$i/${#SERVICES[@]}] $svc"
  docker build -f Dockerfile.java-service --build-arg SERVICE="$svc" \
    -t "ghcr.io/$OWNER/wealth-$svc:$TAG" .
done

# secrets-service is intentionally NOT rebuilt (it's the secret store and rarely changes),
# but docker-compose.prod.yml pins EVERY service — including wealth-secrets-service — to the
# same ${TAG}. Without an image at the new tag, `up -d` fails with "not found". Point a
# secrets-service image at $TAG by retagging the running/most-recent one: no rebuild, so the
# image ID is unchanged and `up -d` leaves the store untouched. Build only if none exists yet
# (fresh host).
SECRETS_IMG="ghcr.io/$OWNER/wealth-secrets-service"
existing=$(docker inspect --format '{{.Config.Image}}' wealth-secrets-service 2>/dev/null || true)
if [ -z "$existing" ]; then
  existing=$(docker images "$SECRETS_IMG" --format '{{.Repository}}:{{.Tag}}' | grep -v '<none>' | head -1)
fi
if [ -n "$existing" ] && [ "$existing" != "$SECRETS_IMG:$TAG" ]; then
  echo "==> Retagging secrets-service ($existing -> $SECRETS_IMG:$TAG)"
  docker tag "$existing" "$SECRETS_IMG:$TAG"
elif [ -z "$existing" ]; then
  echo "==> No secrets-service image found — building it at $TAG"
  docker build -f Dockerfile.java-service --build-arg SERVICE=secrets-service -t "$SECRETS_IMG:$TAG" .
fi

# Point .env.prod at the tag we just built, so nobody has to hand-copy the SHA into a
# `sed` (the literal "TAG=<sha>" placeholder mistake breaks `up -d` with "invalid reference
# format"). Set TAG=<this build> in place, or append it if the key is absent.
if grep -q '^TAG=' "$ENV_FILE"; then
  sed -i "s/^TAG=.*/TAG=$TAG/" "$ENV_FILE"
else
  echo "TAG=$TAG" >> "$ENV_FILE"
fi
echo "==> Set TAG=$TAG in $ENV_FILE"

echo
echo "==> Done. Built ${#SERVICES[@]} images (+ secrets-service tagged) at tag: $TAG"
echo "    Next (TAG is already set in $ENV_FILE):"
echo "      bash deploy/deploy.sh        # pull (tolerant) -> web build -> up -d -> recreate Caddy"
echo "    or just restart the backend:"
echo "      docker compose -f docker-compose.prod.yml --env-file $ENV_FILE up -d"
docker image prune -f >/dev/null 2>&1 || true
