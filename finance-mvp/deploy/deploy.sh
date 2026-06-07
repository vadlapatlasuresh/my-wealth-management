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

echo "==> Pulling images"
$COMPOSE pull

echo "==> Starting stack (rolling)"
$COMPOSE up -d --remove-orphans

echo "==> Waiting for services to report healthy (up to ~7 min; slow on a 1-OCPU box)"
deadline=$(( $(date +%s) + 420 ))
while :; do
  unhealthy=$($COMPOSE ps --format '{{.Name}} {{.Health}}' 2>/dev/null \
    | grep -Ev 'healthy|^$' || true)
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
