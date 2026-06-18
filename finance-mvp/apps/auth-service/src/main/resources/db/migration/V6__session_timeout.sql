-- Per-user client idle-logout window (minutes). Default 5, clamped to 5..30 in the app.
ALTER TABLE users ADD COLUMN session_timeout_minutes INTEGER NOT NULL DEFAULT 5;
