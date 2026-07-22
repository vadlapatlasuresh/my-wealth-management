-- Personal-finance expansion, Phase 2: surface the Financial Health Score in the Grow
-- section. The score is computed client-side from linked accounts + transactions
-- (web utils/healthScore.js), so no backend endpoint is required — this only adds the nav
-- entry. All platforms — Capacitor ships it to iOS/Android too.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('healthscore', 'Health Score', 'ti ti-heartbeat', '/health-score', 'grow', 6, TRUE, 'web,ios,android', '', '1');
