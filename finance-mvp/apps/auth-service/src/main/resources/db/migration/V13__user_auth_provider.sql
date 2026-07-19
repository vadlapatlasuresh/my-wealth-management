-- Records HOW an account came to exist, and separately whether Google sign-in is usable on it.
--
-- Until now the only trace of a Google signup was a fire-and-forget audit event in a different
-- database (auditdb: action='auth.oauth.register'), which made "which users registered with
-- Google?" unanswerable from authdb and silently lossy if audit-service was down.
--
-- Two columns rather than one, because they answer two different questions:
--   auth_provider    - how the account ORIGINATED. Never changes after creation.
--   google_linked_at - when Google sign-in was first used on this account. Also set for users
--                      who originally registered with a password, so linking is no longer
--                      invisible. A password user who later signs in with Google keeps
--                      auth_provider='password' (their password still works) but gains a
--                      google_linked_at.
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'password';
ALTER TABLE users ADD COLUMN google_linked_at TIMESTAMP WITHOUT TIME ZONE;

CREATE INDEX idx_users_auth_provider ON users (auth_provider);

-- NOTE: existing Google-created users are NOT backfilled here. The evidence lives in auditdb,
-- which Flyway cannot reach from this migration, so every current row defaults to 'password'.
-- Run deploy/backfill-auth-provider.sql after deploying to correct them.
