-- Personal-finance expansion, Phase 1: restructure the flat "Finance" nav into a
-- purpose-built section layout so new features have a natural home and the app stops
-- feeling like one long list.
--
--   daily      → Today (the daily-open surface)                     [NEW]
--   money      → Home, Accounts, Transactions, Budget, Make Payment
--   grow       → Goals, Debt Lab, Investments, Calculators, AI Assistant
--   business   → My Business, Taxes                                 (the wedge)
--   realestate → Properties, Deal Room, Fractional                 (unchanged, reordered)
--   settings   → (relabeled "More") Documents, Security, Messages, Subscription, Settings
--
-- SAFETY: additive + in-place. Module ids are NEVER changed (saved per-user nav
-- ordering keeps resolving); only their section/sort_order move, plus the new 'today'
-- module + 3 new sections. The web module registry ships the identical default so the
-- offline/fallback nav matches this server config. resolveNav degrades gracefully if a
-- client is on an older bundle.

-- ---------------------------------------------------------------------------
-- Sections: add the new ones, relabel + reorder the existing ones.
-- ---------------------------------------------------------------------------
INSERT INTO app_section (id, label, sort_order) VALUES ('daily',    'Today',    1);
INSERT INTO app_section (id, label, sort_order) VALUES ('money',    'Money',    2);
INSERT INTO app_section (id, label, sort_order) VALUES ('grow',     'Grow',     3);
INSERT INTO app_section (id, label, sort_order) VALUES ('business', 'Business & Tax', 4);

UPDATE app_section SET sort_order = 5                    WHERE id = 'realestate';
UPDATE app_section SET label = 'More', sort_order = 6    WHERE id = 'settings';

-- The old 'finance' section is now empty (all its modules move below). Keep the row so
-- any client still referencing it degrades gracefully; park it at the end.
UPDATE app_section SET sort_order = 99 WHERE id = 'finance';

-- ---------------------------------------------------------------------------
-- New module: Today (Phase 1). All platforms — Capacitor ships it to iOS/Android too.
-- ---------------------------------------------------------------------------
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('today', 'Today', 'ti ti-sun', '/today', 'daily', 1, TRUE, 'web,ios,android', '', '1');

-- ---------------------------------------------------------------------------
-- Re-home existing modules into the new sections.
-- ---------------------------------------------------------------------------
-- money
UPDATE app_module SET section = 'money', sort_order = 1 WHERE id = 'home';
UPDATE app_module SET section = 'money', sort_order = 2 WHERE id = 'accounts';
UPDATE app_module SET section = 'money', sort_order = 3 WHERE id = 'transactions';
UPDATE app_module SET section = 'money', sort_order = 4 WHERE id = 'budget';
UPDATE app_module SET section = 'money', sort_order = 5 WHERE id = 'billpay';

-- grow
UPDATE app_module SET section = 'grow', sort_order = 1 WHERE id = 'goals';
UPDATE app_module SET section = 'grow', sort_order = 2 WHERE id = 'debt';
UPDATE app_module SET section = 'grow', sort_order = 3 WHERE id = 'invest';
UPDATE app_module SET section = 'grow', sort_order = 4 WHERE id = 'calculators';
UPDATE app_module SET section = 'grow', sort_order = 5 WHERE id = 'ai-assistant';

-- business & tax (the wedge)
UPDATE app_module SET section = 'business', sort_order = 1 WHERE id = 'mybusiness';
UPDATE app_module SET section = 'business', sort_order = 2 WHERE id = 'tax';

-- realestate (section unchanged; ensure ordering is explicit)
UPDATE app_module SET section = 'realestate', sort_order = 1 WHERE id = 'realestate';
UPDATE app_module SET section = 'realestate', sort_order = 2 WHERE id = 'dealroom';
UPDATE app_module SET section = 'realestate', sort_order = 3 WHERE id = 'fractional';

-- more (settings section, relabeled)
UPDATE app_module SET section = 'settings', sort_order = 2 WHERE id = 'security';
UPDATE app_module SET section = 'settings', sort_order = 3 WHERE id = 'messages';
UPDATE app_module SET section = 'settings', sort_order = 4 WHERE id = 'subscription';
UPDATE app_module SET section = 'settings', sort_order = 5 WHERE id = 'settings';
-- ('documents' is served to the client via the registry default, section 'settings',
--  sort_order 1 — no DB row exists for it, so nothing to update here.)
