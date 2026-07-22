-- Personal-finance expansion, Phase 2: surface Spending Insights in the Money section.
-- Category breakdown, month-over-month movers and top merchants are computed client-side
-- (web utils/spending.js) from transactions, so no backend endpoint is required — this
-- only adds the nav entry. All platforms.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('spending', 'Spending', 'ti ti-chart-donut', '/spending', 'money', 8, TRUE, 'web,ios,android', '', '1');
