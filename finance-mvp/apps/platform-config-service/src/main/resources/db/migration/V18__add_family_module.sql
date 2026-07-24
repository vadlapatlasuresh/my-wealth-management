-- Phase 5 (backlog B3): Family / kids mode, in the Shared section next to Household.
--
-- Placed under Shared, not Grow, because a child is a household-owned record — the same
-- ownership model as household goals & bills (auth-service V15/V18). Both guardians in a
-- household see the same children and the same ledger.
--
-- Seeded OFF: the guardian data model should be exercised in staging before it appears in
-- anyone's nav. Flipping this one row turns it on for web, iOS and Android at once.
INSERT INTO feature_flag (flag_key, enabled) VALUES ('family_mode', FALSE);

INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('family', 'Family', 'ti ti-users-group', '/family', 'shared', 3, TRUE, 'web,ios,android', 'family_mode', '1');
