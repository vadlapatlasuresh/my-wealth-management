-- Phase 3a: Shared Household nav entry, in a new "Shared" section.
-- Membership + invites only — no financial data is shared (see
-- docs/designs/SHARED_HOUSEHOLD_DESIGN.md). Sections after it shift down by one.
INSERT INTO app_section (id, label, sort_order) VALUES ('shared', 'Shared', 4);
UPDATE app_section SET sort_order = 5 WHERE id = 'business';
UPDATE app_section SET sort_order = 6 WHERE id = 'realestate';
UPDATE app_section SET sort_order = 7 WHERE id = 'settings';

INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('household', 'Household', 'ti ti-home-heart', '/household', 'shared', 1, TRUE, 'web,ios,android', '', '1');
