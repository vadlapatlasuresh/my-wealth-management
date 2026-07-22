-- Personal-finance expansion, Phase 2: surface the Recurring & subscriptions radar in the
-- Money section. The detection already exists (account-aggregation-service
-- RecurringBillDetector + /api/v1/aggregation/recurring-bills); this only adds the nav entry
-- so the new page is reachable. All platforms — Capacitor ships it to iOS/Android too.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('recurring', 'Recurring', 'ti ti-repeat', '/recurring', 'money', 6, TRUE, 'web,ios,android', '', '1');
