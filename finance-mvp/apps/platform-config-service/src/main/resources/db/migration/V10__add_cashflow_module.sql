-- Personal-finance expansion, Phase 2: surface the Cash-flow view in the Money section.
-- Computed client-side (web utils/cashflow.js) from transactions + accounts + scheduled
-- bills, so no backend endpoint is required — this only adds the nav entry. All platforms.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('cashflow', 'Cash Flow', 'ti ti-arrows-exchange', '/cash-flow', 'money', 7, TRUE, 'web,ios,android', '', '1');
