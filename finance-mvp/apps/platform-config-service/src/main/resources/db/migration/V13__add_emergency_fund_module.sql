-- Personal-finance expansion, Phase 2 (final): surface the Emergency-Fund coach in the Grow
-- section. The target is derived client-side from real monthly expenses
-- (web utils/emergencyFund.js, reusing the health-score helpers), so no backend endpoint is
-- required — this only adds the nav entry. All platforms.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('emergencyfund', 'Emergency Fund', 'ti ti-umbrella', '/emergency-fund', 'grow', 7, TRUE, 'web,ios,android', '', '1');
