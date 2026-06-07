-- Sections
INSERT INTO app_section (id, label, sort_order) VALUES ('finance', 'Finance', 1);
INSERT INTO app_section (id, label, sort_order) VALUES ('realestate', 'Real Estate', 2);
INSERT INTO app_section (id, label, sort_order) VALUES ('settings', 'Settings', 3);

-- Feature flags
INSERT INTO feature_flag (flag_key, enabled) VALUES ('billpay.scheduling', TRUE);
INSERT INTO feature_flag (flag_key, enabled) VALUES ('ai.voiceInput', TRUE);
INSERT INTO feature_flag (flag_key, enabled) VALUES ('invest.brokers', TRUE);
INSERT INTO feature_flag (flag_key, enabled) VALUES ('realestate.valuation', TRUE);

-- App settings
INSERT INTO app_setting (setting_key, setting_value) VALUES ('theme', 'light');
INSERT INTO app_setting (setting_key, setting_value) VALUES ('dashboardLayout', 'netWorthCard,kpiRow,upcomingBills,recentTransactions,aiInsights');

-- Modules (finance section)
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('home', 'Home', 'ti ti-layout-dashboard', '/', 'finance', 1, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('accounts', 'Accounts', 'ti ti-wallet', '/accounts', 'finance', 2, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('transactions', 'Transactions', 'ti ti-arrows-exchange-2', '/transactions', 'finance', 3, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('budget', 'Budget', 'ti ti-chart-pie', '/budget', 'finance', 4, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('billpay', 'Pay Bills', 'ti ti-receipt', '/billpay', 'finance', 5, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('debt', 'Debt Lab', 'ti ti-trending-down', '/debt', 'finance', 6, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('invest', 'Investments', 'ti ti-chart-line', '/invest', 'finance', 7, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('mybusiness', 'My Business', 'ti ti-briefcase', '/mybusiness', 'finance', 8, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('ai-assistant', 'AI Assistant', 'ti ti-sparkles', '/ai-assistant', 'finance', 9, TRUE, 'web,ios,android', '', '1');

-- Modules (realestate section)
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('realestate', 'Properties', 'ti ti-building-estate', '/realestate', 'realestate', 1, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('dealroom', 'Deal Room', 'ti ti-briefcase', '/dealroom', 'realestate', 2, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('fractional', 'Fractional LLC', 'ti ti-brand-stackshare', '/fractional', 'realestate', 3, TRUE, 'web,ios,android', '', '1');

-- Modules (settings section)
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('security', 'Security', 'ti ti-shield-lock', '/security', 'settings', 1, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('messages', 'Messages', 'ti ti-message-2', '/messages', 'settings', 2, TRUE, 'web,ios,android', '', '1');
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('settings', 'Settings', 'ti ti-settings', '/settings', 'settings', 3, TRUE, 'web,ios,android', '', '1');

-- Disclaimers (locale en)
INSERT INTO disclaimer (disclaimer_key, version, locale, title, body_markdown, requires_acceptance, effective_at)
VALUES ('ai.assistant', 2, 'en', 'AI guidance notice',
        'This AI assistant provides general financial insights for informational purposes only. **Not financial advice.** Consult a certified financial advisor before making decisions.',
        FALSE, CURRENT_TIMESTAMP);
INSERT INTO disclaimer (disclaimer_key, version, locale, title, body_markdown, requires_acceptance, effective_at)
VALUES ('realestate.valuation', 1, 'en', 'Estimate notice',
        'Property values are **automated estimates** and may differ from market or appraised value.',
        FALSE, CURRENT_TIMESTAMP);
