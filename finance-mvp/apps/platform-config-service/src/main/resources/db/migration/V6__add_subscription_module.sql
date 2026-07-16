-- Add the Subscription module to the config-driven navigation so every client (web +
-- iOS/Android) surfaces it in the Settings section. The plan catalog + feature config
-- itself lives in payment-service; this row is just the nav entry point.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('subscription', 'Subscription', 'ti ti-crown', '/subscription', 'settings', 5, TRUE, 'web,ios,android', '', '1');
