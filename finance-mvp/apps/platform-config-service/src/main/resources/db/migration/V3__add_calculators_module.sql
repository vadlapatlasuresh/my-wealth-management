-- Add the Finance Calculators module to the config-driven navigation.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('calculators', 'Calculators', 'ti ti-calculator', '/calculators', 'finance', 10, TRUE, 'web,ios,android', '', '1');
