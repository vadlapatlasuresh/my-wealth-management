# Observability (M7) — logs, correlation IDs, metrics, errors

How to see what the system is doing and trace any request end-to-end.

## ✅ Shipped (at the gateway — the single chokepoint for all traffic)
- **Correlation ID** — `AuditLoggingFilter` assigns an `X-Request-Id` to every
  request (reusing an inbound one if present), **propagates it downstream**,
  **echoes it on the response**, and **stores it in the audit row's metadata**.
  One id ties together: client ↔ gateway ↔ service ↔ logs ↔ audit log.
- **Prometheus metrics** — gateway exposes `GET /actuator/prometheus`
  (`micrometer-registry-prometheus`). Because the gateway routes everything, its
  `http_server_requests_seconds` and `spring_cloud_gateway_requests_seconds`
  metrics give **system-wide latency / throughput / error rate broken down by
  route and status** — verified live.
- **Health** — `GET /actuator/health` (+ readiness/liveness probes enabled).

Scrape config (Prometheus):
```yaml
scrape_configs:
  - job_name: terravest-gateway
    metrics_path: /actuator/prometheus
    static_configs: [{ targets: ["gateway-host:8080"] }]
```

## ✅ Per-service metrics (rolled out to all 11)
Every service now ships `micrometer-registry-prometheus`, exposes
`/actuator/prometheus` (+ health), and is reachable for scraping (actuator
permitted in each SecurityConfig). Verified: `:8080–:8090/actuator/prometheus`
all return 200 with JVM, DB-pool, and `http_server_requests` metrics tagged by
`application=<service>`. Each also already **receives** the `X-Request-Id`
propagated by the gateway.

## ⬜ Remaining per-service: correlation id in LOGS (MDC) + JSON logs
The services receive `X-Request-Id` but don't yet write it into their log lines.
Add to each:
1. **Correlation id in logs (MDC)** — a `OncePerRequestFilter` that copies the
   header into the SLF4J MDC so every log line carries it:
   ```java
   @Component
   public class RequestIdFilter extends OncePerRequestFilter {
     protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ... {
       String id = req.getHeader("X-Request-Id");
       MDC.put("requestId", id != null ? id : java.util.UUID.randomUUID().toString());
       try { chain.doFilter(req, res); } finally { MDC.remove("requestId"); }
     }
   }
   ```
3. **Structured JSON logs** — add `logback-spring.xml` with a JSON encoder
   (`net.logstash.logback:logstash-logback-encoder`) including `%mdc{requestId}`,
   so logs are queryable and joinable by request id.

## ⬜ Error tracking & alerting (needs a key/host)
- **Sentry** (web + services): set `SENTRY_DSN`; capture exceptions with the
  `requestId` + user context. 🔑
- **Alerting / SLOs**: alert on 5xx rate, p95 latency, auth-failure spikes,
  payment failures, DB pool saturation — off the Prometheus metrics above.
- **Tracing**: OpenTelemetry spans across gateway→service hops (the `X-Request-Id`
  is the seed; upgrade to W3C `traceparent` when adding OTel).

## ✅ Inter-service propagation (Feign)
financial-core's `FeignConfig` forwards the MDC `requestId` as `X-Request-Id` on
outbound Feign calls, so the id is transitive across hops. Verified: an external
request `trace-transitive-XYZ` reached real-estate (via financial-core) and was
recorded on the real-estate audit row with the **same** id.

## Where this surfaces to operators
The **Admin · Analytics** dashboard already shows usage/error KPIs from the audit
stream. Once per-service Prometheus is rolled out, wire a Grafana board (or extend
the admin dashboard) with live latency/throughput/error from `/actuator/prometheus`.
