-- Add the Taxes module to the config-driven navigation. It was added to the app's
-- module registry but never seeded here, so the served config (and any client that
-- relies on it — notably iOS/Android) was missing "Taxes" from the sidebar.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('tax', 'Taxes', 'ti ti-receipt-tax', '/tax', 'finance', 12, TRUE, 'web,ios,android', '', '1');
