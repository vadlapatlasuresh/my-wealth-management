-- Phase 3c: opt-in sharing of PERSONAL resources with your household (Option C in
-- docs/designs/SHARED_HOUSEHOLD_DESIGN.md).
--
-- This is the first slice that touches existing personal data, so it is built as a REGISTRY of
-- explicit grants rather than a change to how anything is scoped:
--
--   * No existing query is modified. Every service still answers `WHERE user_id = :me`.
--   * A share is a row someone deliberately created: "user X shares resource R with household H".
--   * Reading shared data goes through a SEPARATE, additive path that consults this registry —
--     so a bug here can at worst fail to show shared data, never silently widen an existing query.
--   * Revoking deletes the row, and access resolves per request, so it takes effect immediately.
--
-- Deliberately NOT stored: any copy of the shared resource's values. The registry records only
-- WHAT was shared and BY WHOM; the numbers stay in their owning service.

CREATE TABLE household_share (
    id             BIGSERIAL PRIMARY KEY,
    household_id   BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    owner_user_id  BIGINT NOT NULL,          -- who owns the resource and chose to share it
    resource_type  VARCHAR(40) NOT NULL,     -- ACCOUNT (v1). Future: GOAL, PROPERTY, …
    resource_id    VARCHAR(120) NOT NULL,    -- the owning service's id for that resource
    label          VARCHAR(160),             -- display name captured at share time, for listing
    created_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    -- Sharing the same resource into the same household twice is a no-op, not two grants.
    CONSTRAINT uq_household_share UNIQUE (household_id, owner_user_id, resource_type, resource_id)
);

CREATE INDEX idx_household_share_household ON household_share (household_id);
CREATE INDEX idx_household_share_owner ON household_share (owner_user_id);
