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

# Reclaim disk BEFORE pulling/building. Old per-SHA images and build cache
# accumulate on the VM's small disk and a fresh pull can hit "no space left on
# device" mid-extract.
#
# IMPORTANT: use `image prune -f` (dangling only) here, NOT `-af`. Our service
# images are BUILT ON THE VM by build-all.sh and are not yet backing a running
# container at this point, so `-af` (remove all unused) would DELETE the images
# build-all.sh just tagged — and the `up -d` below then fails with "not found".
# The real cleanup of old per-SHA tags happens AFTER `up -d` (see the prune near
# the end), where the freshly-started stack protects the new images. Container
# and build-cache prunes are safe to run aggressively here.
echo "==> Reclaiming disk (removing dangling images/containers/build cache)"
df -h / | awk 'NR==1 || /\//{print "    "$0}'
docker container prune -f >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
df -h / | awk 'NR==2{print "    after prune: "$4" free on "$6}'

echo "==> Pulling images (tolerating locally-built ones)"
# Images are built ON the VM by build-all.sh and NOT pushed to a registry, so a plain
# `pull` aborts with "not found" on those tags. --ignore-pull-failures pulls the public
# images (Caddy, etc.) and SKIPS the local-only GHCR ones; the `up -d` below then uses the
# local images. A genuinely-missing image still surfaces at `up -d`, so nothing is masked.
#
# The pull output is captured so the preflight below can tell the difference between
# "skipped a local-only tag" (fine) and "failed to refresh a registry tag" (stale image!).
PULL_LOG=$(mktemp)
trap 'rm -f "$PULL_LOG"' EXIT
$COMPOSE pull --ignore-pull-failures 2>&1 | tee "$PULL_LOG" || true

# Preflight: fail FAST and CLEARLY if any service image at this TAG is neither present
# locally nor pullable. Without this, a missing tag only surfaces as a cryptic
# "failed to resolve reference … not found" partway through `up -d`.
#
# The classic trap: build-all.sh pins .env.prod to a short-SHA tag that exists ONLY as a
# local image (CI publishes full-SHA + :latest, never the short SHA). If those local
# images are later gone (or you switch hosts) a pull-based deploy has nothing to run.
# We check AFTER the pull above, so anything still absent locally is genuinely unavailable.
RESOLVED_TAG="${TAG:-$(grep '^TAG=' .env.prod | cut -d= -f2- | tr -d '[:space:]')}"
echo "==> Preflight: verifying service images are available at TAG=$RESOLVED_TAG"

# Is this a tag CI actually publishes? CI tags each image ':latest' and the FULL 40-char
# commit SHA — never a short SHA. Anything else can only have come from a local
# build-all.sh run, which changes what a failed pull MEANS (see below).
if [ "$RESOLVED_TAG" = "latest" ] || printf '%s' "$RESOLVED_TAG" | grep -qE '^[0-9a-f]{40}$'; then
  REGISTRY_TAG=1
else
  REGISTRY_TAG=0
fi

missing=""
while IFS= read -r img; do
  case "$img" in
    *ghcr.io/*wealth-*)
      docker image inspect "$img" >/dev/null 2>&1 || missing="$missing $img" ;;
  esac
done < <($COMPOSE config --images 2>/dev/null | sort -u)
if [ -n "$missing" ]; then
  echo "ERROR: these images are neither built locally nor pullable at this TAG:" >&2
  for m in $missing; do echo "    - $m" >&2; done
  cat >&2 <<'EOM'

CI publishes images as :latest and the FULL commit SHA — never a short SHA. Pick one fix:
  • Deploy the CI-published images (recommended):
        sed -i 's/^TAG=.*/TAG=latest/' .env.prod && bash deploy/deploy.sh
  • Or build them on this VM (when CI images are unavailable):
        bash deploy/build-all.sh && bash deploy/deploy.sh
        (build-all.sh pins TAG to a local-only SHA on purpose so its local build wins;
         reset TAG=latest afterwards to go back to the pull-based deploy.)
EOM
  exit 1
fi
echo "    all service images present ✓"

# ---------------------------------------------------------------------------
# Stale-image guard.
#
# Presence is NOT freshness. The failure this catches: .env.prod is left pinned to an old
# tag (or a registry pull silently fails), `up -d` happily starts the STALE LOCAL image,
# and the only symptom is the app 404ing new endpoints with Spring's
# "No static resource <path>" — which looks like an application bug, not a deploy problem.
#
# Because the pull above already ran, a wealth-* image that FAILED to pull while we are on
# a registry tag means the local copy could not be refreshed → it may be stale.
failed_pulls=$(grep -E 'wealth-[a-z-]+' "$PULL_LOG" 2>/dev/null | grep -ciE 'error|✘' || true)

if [ "$REGISTRY_TAG" = "1" ] && [ "${failed_pulls:-0}" -gt 0 ]; then
  echo "ERROR: TAG=$RESOLVED_TAG is a registry tag, but $failed_pulls service image(s) could not be pulled." >&2
  cat >&2 <<EOM

Deploying now would silently run whatever STALE copy is already on this host — the symptom
is new endpoints returning "No static resource ...". Refusing to continue.

Usually this is registry auth. Log in and re-run:
      echo "\$GHCR_PAT" | docker login ghcr.io -u <github-user> --password-stdin
      bash deploy/deploy.sh

If the registry is genuinely unavailable, build on this host instead:
      bash deploy/build-all.sh && bash deploy/deploy.sh
EOM
  exit 1
fi

if [ "$REGISTRY_TAG" = "0" ]; then
  echo "    WARNING: TAG=$RESOLVED_TAG is a LOCAL-ONLY tag (CI publishes :latest and full SHAs)." >&2
  echo "             You are deploying images built on this host — they do NOT update from CI." >&2
  echo "             To deploy the CI build:  sed -i 's/^TAG=.*/TAG=latest/' .env.prod" >&2
fi

# Always show what is actually about to run, so a stale image is visible at a glance.
echo "    image build dates:"
while IFS= read -r img; do
  case "$img" in
    *ghcr.io/*wealth-*)
      created=$(docker image inspect "$img" --format '{{.Created}}' 2>/dev/null | cut -c1-10)
      printf '      %-72s %s\n' "${img##*/}" "${created:-unknown}" ;;
  esac
done < <($COMPOSE config --images 2>/dev/null | sort -u)

# Build the web SPA into ./web-dist (Caddy serves it at /). Runs in a Node container
# so the VM needs no Node install. WEB_API_BASE (in .env.prod) is the public origin the
# browser calls; same-origin here, so the app hits /api on this same domain.
if grep -q "^WEB_API_BASE=" .env.prod; then
  WEB_API_BASE=$(grep "^WEB_API_BASE=" .env.prod | cut -d= -f2-)
  echo "==> Building web SPA (VITE_API_BASE=$WEB_API_BASE)"
  # The ops portal calls ITS OWN origin, not the member one.
  #
  # Its Caddy block proxies /api/* to the gateway itself, so https://ops.<domain>/api/... works
  # and is SAME-ORIGIN. That matters three ways:
  #   - it satisfies the deliberately tight `connect-src 'self'` CSP on the ops host;
  #   - no CORS is involved at all, so the ops portal can't be broken by a WEB_ORIGINS typo;
  #   - the ops origin never has to be granted access to the member origin.
  # Baking the member's WEB_API_BASE into the ops bundle (as this once did) makes every ops
  # API call a cross-origin request that its own CSP then blocks.
  OPS_DOMAIN_VAL=$(grep "^OPS_DOMAIN=" .env.prod 2>/dev/null | cut -d= -f2- | tr -d '[:space:]' || true)
  if [ -n "$OPS_DOMAIN_VAL" ]; then
    OPS_API_BASE="https://$OPS_DOMAIN_VAL"
  else
    # OPS_DOMAIN unset -> the ops site block is inert (Caddy serves ops.localhost with an
    # internal cert), so this bundle isn't reachable anyway. Point it at the member origin so
    # the build is still coherent rather than half-configured.
    OPS_API_BASE="$WEB_API_BASE"
  fi
  echo "    ops portal API base: $OPS_API_BASE"

  # Two bundles, one npm install: the member app (dist) and the OPS PORTAL (dist-ops).
  # They are separate builds, not two entries of one build, so that ops assets are never
  # precached into members' service workers and never served from the member origin.
  # VITE_API_BASE is overridden for the ops build only — different origin, different base.
  docker run --rm -v "$PWD":/work -w /work/apps/web \
    -e VITE_API_BASE="$WEB_API_BASE" -e OPS_API_BASE="$OPS_API_BASE" node:20-alpine \
    sh -c 'npm install --no-audit --no-fund --silent && npm run build && VITE_API_BASE="$OPS_API_BASE" npm run build:ops' >/dev/null
  # Refill web-dist IN PLACE (keep the directory's inode). Caddy bind-mounts
  # ./web-dist:/srv; if we `rm -rf web-dist` the running container keeps pointing
  # at the old (unlinked) inode and serves an empty /srv -> 404 on every page.
  # Clearing contents but keeping the dir preserves the mount.
  mkdir -p web-dist
  find web-dist -mindepth 1 -delete
  cp -r apps/web/dist/. web-dist/
  echo "    web built -> web-dist ($(ls web-dist | wc -l) entries)"

  # Same in-place trick for the ops bundle (Caddy bind-mounts ./web-dist-ops:/srv-ops).
  mkdir -p web-dist-ops
  find web-dist-ops -mindepth 1 -delete
  cp -r apps/web/dist-ops/. web-dist-ops/
  echo "    ops portal built -> web-dist-ops ($(ls web-dist-ops | wc -l) entries)"
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

echo "==> Pruning now-unused images (old per-SHA tags freed by this deploy)"
docker image prune -af >/dev/null || true

echo "==> Status"
$COMPOSE ps
echo "==> Done. API is fronted by Caddy on :443 for \$API_DOMAIN."
