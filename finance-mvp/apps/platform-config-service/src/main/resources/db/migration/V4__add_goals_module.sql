-- Add the Goals module to the config-driven navigation.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('goals', 'Goals', 'ti ti-target', '/goals', 'finance', 11, TRUE, 'web,ios,android', '', '1');
