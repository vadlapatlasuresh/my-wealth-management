-- Resolved geo-location for a login/activity event's source IP (MaxMind GeoLite2).
-- Nullable: populated only when the GeoIP database is configured and the IP resolves;
-- otherwise the UI falls back to showing the raw IP address.
ALTER TABLE audit_events ADD COLUMN geo_city    VARCHAR(128);
ALTER TABLE audit_events ADD COLUMN geo_country VARCHAR(128);
