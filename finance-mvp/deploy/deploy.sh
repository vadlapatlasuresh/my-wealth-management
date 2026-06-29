#!/usr/bin/env bash
# ============================================================
#  deploy.sh — pull the published images and (re)start the stack on a VM.
#  Run from the finance-mvp/ directory ON the VM (or via ssh) as the deploy user.
#
#  Prereqs on the VM:
#    - docker + compose plugin (see bootstrap-vm.sh)
#    - this repo checked out (or at least: docker-compose.prod.yml, Caddyfile, .env.prod)
#    - .env.prod filled in (cp .env.prod.example .env.prod && edit)
#    - GHCR pull access: echo $GHCR_PAT | docker login ghcr.io -u <user> --password-stdin
#      (PAT needs read:packages; only required if the images are private)
#
#  Usage:
#    ./deploy/deploy.sh                 # deploy TAG from .env.prod (default 'latest')
#    TAG=<git-sha> ./deploy/deploy.sh   # deploy a specific promoted SHA
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."   # -> finance-mvp/
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

if [ ! -f .env.prod ]; then
  echo "ERROR: .env.prod not found. Run: cp .env.prod.example .env.prod && edit it." >&2
  exit 1
fi

# Allow overriding TAG from the environment (e.g. the SHA promoted from QA).
if [ -n "${TAG:-}" ]; then
  export TAG
  echo "==> Deploying TAG=$TAG"
else
  echo "==> Deploying TAG from .env.prod"
fi

echo "==> Validating compose config"
$COMPOSE config >/dev/null

echo "==> Pulling images (tolerating locally-built ones)"
# Images are built ON the VM by build-all.sh and NOT pushed to a registry, so a plain
# `pull` aborts with "not found" on those tags. --ignore-pull-failures pulls the public
# images (Caddy, etc.) and SKIPS the local-only GHCR ones; the `up -d` below then uses the
# local images. A genuinely-missing image still surfaces at `up -d`, so nothing is masked.
$COMPOSE pull --ignore-pull-failures

# Build the web SPA into ./web-dist (Caddy serves it at /). Runs in a Node container
# so the VM needs no Node install. WEB_API_BASE (in .env.prod) is the public origin the
# browser calls; same-origin here, so the app hits /api on this same domain.
if grep -q "^WEB_API_BASE=" .env.prod; then
  WEB_API_BASE=$(grep "^WEB_API_BASE=" .env.prod | cut -d= -f2-)
  echo "==> Building web SPA (VITE_API_BASE=$WEB_API_BASE)"
  docker run --rm -v "$PWD":/work -w /work/apps/web -e VITE_API_BASE="$WEB_API_BASE" node:20-alpine \
    sh -c "npm install --no-audit --no-fund --silent && npm run build" >/dev/null
  # Refill web-dist IN PLACE (keep the directory's inode). Caddy bind-mounts
  # ./web-dist:/srv; if we `rm -rf web-dist` the running container keeps pointing
  # at the old (unlinked) inode and serves an empty /srv -> 404 on every page.
  # Clearing contents but keeping the dir preserves the mount.
  mkdir -p web-dist
  find web-dist -mindepth 1 -delete
  cp -r apps/web/dist/. web-dist/
  echo "    web built -> web-dist ($(ls web-dist | wc -l) entries)"
else
  echo "==> Skipping web build (no WEB_API_BASE in .env.prod; serving existing web-dist if present)"
fi

echo "==> Starting stack (rolling)"
$COMPOSE up -d --remove-orphans

# Force-recreate Caddy so it re-binds the freshly built web-dist. (up -d above
# won't recreate it when only the static files changed, which would leave it
# serving a stale/empty /srv after a rebuild.)
echo "==> Recreating Caddy to pick up the new web build"
$COMPOSE up -d --force-recreate --no-deps caddy

echo "==> Waiting for services to report healthy (up to ~7 min; slow on a 1-OCPU box)"
deadline=$(( $(date +%s) + 420 ))
while :; do
  # Flag only containers whose health is explicitly set AND not "healthy"
  # (i.e. "starting" / "unhealthy"). Containers without a healthcheck — e.g.
  # Caddy — report an empty health field and must NOT be treated as unhealthy,
  # or the gate never passes. Exact-match avoids the substring trap where
  # 'healthy' also matches 'unhealthy'.
  unhealthy=$($COMPOSE ps --format '{{.Name}} {{.Health}}' 2>/dev/null \
    | awk '$2 != "" && $2 != "healthy" { print }' || true)
  if [ -z "$unhealthy" ]; then echo "    all services healthy ✓"; break; fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "    TIMEOUT — still not healthy:"; echo "$unhealthy"
    echo "    Logs: $COMPOSE logs --tail=50 <service>"
    exit 1
  fi
  sleep 5
done

echo "==> Pruning dangling images"
docker image prune -f >/dev/null || true

echo "==> Status"
$COMPOSE ps
echo "==> Done. API is fronted by Caddy on :443 for \$API_DOMAIN."
