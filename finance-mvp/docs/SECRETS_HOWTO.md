# Secrets Service — Step-by-Step How-To (future reference)

The `secrets-service` (`apps/secrets-service`, port **8091**) is a centralized,
encrypted secret store. Secrets live as **AES-256-GCM ciphertext** under a
per-version data key (DEK), which is itself stored only **wrapped by a root key
(KEK)**. Nothing decryptable is ever in git or `.env`. Design rationale:
[architecture/SECRET_MANAGEMENT_DESIGN.md](./architecture/SECRET_MANAGEMENT_DESIGN.md).

> **Status:** built & verified end-to-end locally. Provider rollout to the 10
> services is staged (see §6). All commands below are copy-paste runnable.

---

## 0. Concepts in 30 seconds
- **Secret** — a named value, e.g. `stripe.secret_key`, in a **scope** (`stripe`).
- **Version** — every write makes a new ACTIVE version; the old one becomes PREVIOUS.
- **Grant** — `(principal, scope, READ)`: which service may read which scope.
- **KEK** — root key. Dev: derived from `SECRETS_MASTER_KEY`. Prod: GCP KMS (never on disk).
- **DEK** — per-version AES key that encrypts the value; stored only KEK-wrapped.
- Every read/write/rotate/deny is **audited** into the tamper-evident hash chain.

---

## 1. Build & run (local)

```bash
cd finance-mvp
# build
JAVA_HOME=/opt/homebrew/opt/openjdk@17 mvn -q -f apps/secrets-service/pom.xml clean package -DskipTests
# run (dev profile = H2; audit-service should be up on :8090 so events are chained)
java -jar apps/secrets-service/target/secrets-service-0.0.1-SNAPSHOT.jar --spring.profiles.active=dev
# health
curl -s localhost:8091/actuator/health
```

On first boot the **seeder** creates a placeholder for every required secret and
the default per-service grants (from `src/main/resources/secrets-seed.json`):
```
[SecretSeeder] catalog seeded: 20 new placeholder secrets, 28 new grants.
```
Placeholders look like `REPLACE_ME::<name>` so the catalog is complete and
visible immediately; you replace each with the real value via rotate (§3).

---

## 2. A service reads its secrets (internal API)

Identity (interim, matches the existing internal-key pattern — upgrade to
service-JWT/mTLS later):
- `X-Internal-Key: <SECRETS_INTERNAL_KEY>` (dev: `dev-internal-secrets-key`)
- `X-Service-Id: <principal>` e.g. `payment-service`

```bash
IK='X-Internal-Key: dev-internal-secrets-key'

# all secrets in a granted scope → {name: value}
curl -s "http://localhost:8091/internal/secrets?scope=stripe" -H "$IK" -H 'X-Service-Id: payment-service'
# → {"stripe.secret_key":"...","stripe.webhook_secret":"..."}

# a single secret
curl -s "http://localhost:8091/internal/secrets/gemini.api_key" -H "$IK" -H 'X-Service-Id: ai-insights-service'

# DENIED examples (audited as secret.denied):
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8091/internal/secrets?scope=stripe" -H "$IK" -H 'X-Service-Id: ai-insights-service'   # 403 (no grant)
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8091/internal/secrets?scope=stripe" -H 'X-Internal-Key: wrong' -H 'X-Service-Id: payment-service'  # 401
```

---

## 3. Set / rotate a real value (admin API)

Admin endpoints require a **JWT with the `ADMIN` role**. Get one by signing in as
an admin user (granted via `SUPPORT_BOOTSTRAP_EMAIL`), or for local testing mint
one with the dev secret:

```bash
SECRET='THIS_IS_A_VERY_LONG_AND_SECURE_SECRET_KEY_FOR_JWT_AUTHENTICATION_DEMO_PURPOSES_ONLY_REPLACE_IN_PRODUCTION'
ADMIN_JWT=$(python3 - "$SECRET" <<'PY'
import sys,hmac,hashlib,base64,json,time
s=sys.argv[1].encode(); b=lambda x: base64.urlsafe_b64encode(x).rstrip(b'=')
h=b(json.dumps({"alg":"HS256","typ":"JWT"},separators=(',',':')).encode()); n=int(time.time())
p=b(json.dumps({"sub":"1","roles":["ADMIN"],"iat":n,"exp":n+3600},separators=(',',':')).encode())
print((h+b'.'+p+b'.'+b(hmac.new(s,h+b'.'+p,hashlib.sha256).digest())).decode())
PY
)

# set/rotate the real value (creates a new ACTIVE version; old → PREVIOUS)
curl -s -X POST "http://localhost:8091/admin/secrets/gemini.api_key/rotate" \
  -H "Authorization: Bearer $ADMIN_JWT" -H 'Content-Type: application/json' \
  -d '{"value":"AIzaSy-your-real-key"}'

# list metadata (NEVER returns values)
curl -s "http://localhost:8091/admin/secrets" -H "Authorization: Bearer $ADMIN_JWT"
```

> Rotation is zero-downtime: create the new key in the provider dashboard → rotate
> here → consuming services pick it up on their next cache refresh → revoke the old
> key in the provider.

---

## 4. Seed the whole catalog with real values (first deploy)

After deploy, the catalog is all placeholders. Replace them once:

```bash
# loop your real values (kept OUT of git — read from an operator-only file or prompt)
while IFS='=' read -r name value; do
  [ -z "$name" ] && continue
  curl -s -X POST "$SECRETS_URL/admin/secrets/$name/rotate" \
    -H "Authorization: Bearer $ADMIN_JWT" -H 'Content-Type: application/json' \
    -d "{\"value\":$(printf '%s' "$value" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}" >/dev/null
  echo "set $name"
done < /run/secrets-input.env   # tmpfs / never committed
```

---

## 5. Add a new secret or a new consuming service

- **New secret:** add an entry to `secrets-seed.json` (`name`, `scope`,
  `description`, optional `rotationDays`) → redeploy → placeholder appears →
  rotate in the real value. (Or `POST /admin/secrets` directly.)
- **New grant:** add `{principal, scope}` to the `grants` array → redeploy. The
  seeder is idempotent — existing secrets/grants and real values are untouched.

---

## 6. Wire a service to fetch from the store (`secrets-client`)

Each service fetches its scopes at boot and exposes them as a Spring
`PropertySource`, so existing `${PLAID_SECRET}` / `${jwt.secret}` placeholders
resolve unchanged. Sketch (add as a shared module, or per service):

```java
// EnvironmentPostProcessor registered in META-INF/spring.factories
public class SecretsEnvPostProcessor implements EnvironmentPostProcessor {
  public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication app) {
    if (!env.acceptsProfiles(Profiles.of("prod"))) return;     // dev keeps using .env.local
    String base = env.getProperty("SECRETS_URI", "http://secrets-service:8091");
    String id   = env.getProperty("spring.application.name");
    var http = java.net.http.HttpClient.newHttpClient();
    Map<String,Object> all = new HashMap<>();
    for (String scope : scopesFor(id)) {                        // e.g. ["jwt","stripe"]
      var req = HttpRequest.newBuilder(URI.create(base+"/internal/secrets?scope="+scope))
          .header("X-Internal-Key", env.getProperty("SECRETS_INTERNAL_KEY"))
          .header("X-Service-Id", id).build();
      var body = http.send(req, BodyHandlers.ofString()).body();
      all.putAll(new ObjectMapper().readValue(body, Map.class)); // {"stripe.secret_key": "..."}
    }
    // map secret names → existing property keys, e.g. stripe.secret_key → stripe.secret-key
    env.getPropertySources().addFirst(new MapPropertySource("secrets-store", mapNames(all)));
  }
}
```

**Implemented pilot:** `ai-insights-service` ships this exact shim
(`SecretsEnvironmentPostProcessor` + `META-INF/spring.factories`). It activates only
when `SECRETS_URI` **and** `SECRETS_SCOPES` are set (so local dev is unchanged), maps
`gemini.api_key` → `gemini.api-key`, and skips placeholder values. Verified: with
`GEMINI_API_KEY` removed from the environment, the service fetched the key from the
store at boot and made a real authenticated Gemini call.

**Rollout order (low-risk first):** `ai-insights-service` (done) → the rest. Lift the
same class into each service (or a shared module), set its `SECRETS_SCOPES`, and remove
the migrated keys from `.env.prod` as you go.

---

## 7. Production deploy

1. **KEK in KMS, not env (implemented):** `terraform apply` in `infra/gcp` creates the
   KMS key + a VM service account with encrypt/decrypt on it. Then set on the VM:
   `SECRETS_PROVIDER=kms` and `SECRETS_KMS_KEY_NAME=$(terraform output -raw secrets_kms_key_name)`,
   and leave `SECRETS_MASTER_KEY` blank. `GcpKmsMasterKeyProvider` wraps/unwraps DEKs via
   the KMS REST API using the VM's metadata-server identity — no key file, no env secret.
2. **Compose:** the `secrets-service` block is in `docker-compose.prod.yml`. Give
   services `SECRETS_URI=http://secrets-service:8091` + `SECRETS_INTERNAL_KEY`.
3. **`.env.prod` shrinks to non-secrets:** domains, image tag, provider toggles.
   `JWT_SECRET`, `APP_ENCRYPTION_KEY`, all API keys, DB passwords → move into the
   store (seeded once by an operator, §4). The only thing the VM needs is its KMS
   identity, which is a metadata credential, not a file value.
4. **Set `OTP_EXPOSE_DEV_CODE=false`** and rotate every key that ever touched git.

---

## 8. Security guarantees & notes
- Values are AES-256-GCM at rest; the DEK is never stored unwrapped; the KEK is
  never persisted (KMS in prod).
- Default-deny: a service with no grant for a scope gets `403` (audited).
- Metadata/list endpoints and logs **never** contain secret values.
- Every operation is hash-chained in audit-service; tampering is detectable via
  `GET /api/v1/audit/verify`.
- `secrets-service` is internal-only — the API gateway must not route `/internal/**`
  or `/admin/**` publicly.

---

## 9. Verified end-to-end (local), 2026-06-09
| Step | Result |
|---|---|
| Seed | 20 placeholder secrets, 28 grants |
| Authorized read (`gemini`) | decrypts & returns value |
| Denied (no grant / bad key) | `403` / `401` |
| Admin rotate | version 2, read-back returns new value |
| Metadata list | 20 entries, no values |
| Audit | every op appended to the tamper-evident chain (verified by count delta) |
