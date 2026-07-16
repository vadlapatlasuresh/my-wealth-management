-- Actor/target separation + the semantic fields (reason, before/after).
--
-- THE GAP THIS CLOSES: `user_id` holds the JWT subject — the ACTOR. When an ops agent opened
-- customer 42, the row said "ops user 7 did GET /api/v1/support/users/42". There was nowhere to
-- record WHO WAS ACTED UPON, so "show me everyone who touched customer 42" meant a LIKE scan over
-- URL paths, and "what changed and why" was not recorded at all.

ALTER TABLE audit_events ADD COLUMN actor_kind     VARCHAR(20);   -- MEMBER | OPS | SYSTEM | ANONYMOUS
ALTER TABLE audit_events ADD COLUMN actor_id       VARCHAR(64);   -- ops_users id when actor_kind=OPS, else the customer id
ALTER TABLE audit_events ADD COLUMN target_user_id VARCHAR(64);   -- the CUSTOMER acted upon
ALTER TABLE audit_events ADD COLUMN reason         TEXT;          -- the actor's stated justification
ALTER TABLE audit_events ADD COLUMN before_json    TEXT;          -- state before a change (null for reads)
ALTER TABLE audit_events ADD COLUMN after_json     TEXT;          -- state after a change (null for reads)
ALTER TABLE audit_events ADD COLUMN ticket_ref     VARCHAR(64);

-- Which formula produced entry_hash. 1 = legacy unkeyed SHA-256 over the original field set;
-- 2 = HMAC-SHA256 over the field set including the columns above. Versioning the chain is what
-- lets rows written before this migration keep verifying under the rules they were written with,
-- instead of a schema change silently "breaking" the tamper-evidence of the entire history.
ALTER TABLE audit_events ADD COLUMN hash_version   INT NOT NULL DEFAULT 1;

-- The index that makes the actual question cheap.
CREATE INDEX idx_audit_target_time ON audit_events (target_user_id, created_at);
CREATE INDEX idx_audit_actor_time  ON audit_events (actor_id, created_at);

-- Backfill the new actor columns from what we already know. This is SAFE for the hash chain:
-- version-1 rows are verified with the version-1 formula, which does not include any of these
-- columns, so their entry_hash is unaffected. Nothing that IS hashed is touched.
UPDATE audit_events
SET actor_id = user_id,
    actor_kind = CASE
        WHEN actor_type = 'OPS'     THEN 'OPS'
        WHEN actor_type = 'SYSTEM'  THEN 'SYSTEM'
        WHEN user_id IS NULL        THEN 'ANONYMOUS'
        ELSE 'MEMBER'
    END
WHERE actor_kind IS NULL;

-- NOTE: target_user_id is deliberately NOT backfilled. It could be guessed by regexing historical
-- URL paths, but a guessed access record is worse than an absent one — it would read as fact in
-- an audit. History stays honestly incomplete; the trail is authoritative from here forward.
