-- Phase 3b: household-owned goals & bills, in the Shared section.
-- These are NEW household-owned entities, not shared views of personal goals — see
-- docs/designs/SHARED_HOUSEHOLD_DESIGN.md. Served by auth-service under the existing
-- /api/v1/household/** gateway route, so no new gateway entry is needed.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('sharedmoney', 'Goals & Bills', 'ti ti-users-group', '/shared-money', 'shared', 2, TRUE, 'web,ios,android', '', '1');
