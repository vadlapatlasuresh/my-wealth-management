-- Personal-finance expansion, Phase 3: the Money Coach — proactive, ranked next-best-actions.
-- Composes signals the client already computes (anomalies, cash flow, emergency-fund gap,
-- health factors, spending movers, debt) and merges the AI service's insights as attributed
-- opportunities. Client-side, so no new backend endpoint — this only adds the nav entry.
INSERT INTO app_module (id, title, icon, route, section, sort_order, enabled, platforms, required_flags, app_config_version)
VALUES ('coach', 'Coach', 'ti ti-compass', '/coach', 'grow', 8, TRUE, 'web,ios,android', '', '1');
