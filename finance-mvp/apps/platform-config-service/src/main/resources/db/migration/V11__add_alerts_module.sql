-- Personal-finance expansion, Phase 2: surface Smart Alerts (anomaly detection) in the
-- Today section. Detection is client-side (web utils/alerts.js) over accounts + transactions,
-- so no backend endpoint is required — this only adds the nav entry. All platforms.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('alerts', 'Alerts', 'ti ti-bell', '/alerts', 'daily', 2, TRUE, 'web,ios,android', '', '1');
