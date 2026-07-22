-- Enforce "a user may belong to at most ONE household at a time" at the DATABASE level.
--
-- V14 deliberately shipped without this because the natural expression — a partial unique
-- index, `CREATE UNIQUE INDEX ... WHERE status = 'ACTIVE'` — is PostgreSQL-only, and these
-- migrations also run against H2 in the test context, where it fails and takes the whole
-- ApplicationContext down.
--
-- Cross-database alternative: a column that mirrors user_id ONLY while the membership is
-- ACTIVE and is NULL otherwise. Both PostgreSQL and H2 permit many NULLs in a UNIQUE column,
-- so a plain UNIQUE constraint gives exactly the intended guarantee on both. The column is
-- maintained by a JPA @PrePersist/@PreUpdate callback on HouseholdMember, so it cannot drift.
ALTER TABLE household_member ADD COLUMN active_user_id BIGINT;

-- Backfill existing rows before the constraint goes on.
UPDATE household_member SET active_user_id = user_id WHERE status = 'ACTIVE';

ALTER TABLE household_member
    ADD CONSTRAINT uq_household_member_active_user UNIQUE (active_user_id);
