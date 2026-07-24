-- Phase 4 (backlog B1): net-worth / savings benchmarking, in the Grow section.
--
-- Three independent switches, each with a distinct job:
--   1. feature_flag 'benchmarks' (seeded FALSE below) + required_flags — SERVER-side nav
--      visibility, applied identically on web, iOS and Android. This is the one to flip when a
--      real peer dataset goes live; no client release needed.
--   2. client FLAGS.BENCHMARKS_LIVE — whether the page calls the peer endpoint at all. Off, the
--      page still shows the user's own real figures.
--   3. feature_key individual.benchmarks (Plus+) — the entitlement, checked by <FeatureGate>.
--
-- Served by financial-core-service under the existing /api/v1/me/** gateway route, so no
-- RouteLocator change is needed (see the gateway-route-locator gotcha).

-- Seeded OFF: there is no peer dataset connected yet, and this feature must never render
-- fabricated peer numbers. Flip to TRUE only once benchmarks.provider points at a real dataset.
INSERT INTO feature_flag (flag_key, enabled) VALUES ('benchmarks', FALSE);

INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('benchmarks', 'Benchmarks', 'ti ti-users-plus', '/benchmarks', 'grow', 12, TRUE, 'web,ios,android', 'benchmarks', '1');
