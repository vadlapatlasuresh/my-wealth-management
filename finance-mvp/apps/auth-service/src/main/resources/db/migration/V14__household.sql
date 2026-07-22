-- Phase 3a: Shared Household — membership + invitations ONLY. No data sharing.
--
-- Design: docs/designs/SHARED_HOUSEHOLD_DESIGN.md
--
-- Deliberately additive: this introduces NEW tables and changes nothing about how existing
-- rows are scoped. Every service still authorizes with `WHERE user_id = :me`; creating or
-- joining a household grants access to household-OWNED objects only (added in 3b), never to
-- another member's personal accounts, transactions, goals, properties or business data.
--
-- Authorization for anything household-scoped resolves through exactly one rule —
-- "is this user an ACTIVE member of this household?" — so it has one place to get right and
-- one place to test, instead of auditing ~59 user_id columns across 10 services.

CREATE TABLE household (
    id                 BIGSERIAL PRIMARY KEY,
    name               VARCHAR(120) NOT NULL,
    created_by_user_id BIGINT NOT NULL,
    created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE household_member (
    id           BIGSERIAL PRIMARY KEY,
    household_id BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    user_id      BIGINT NOT NULL,
    role         VARCHAR(20) NOT NULL,            -- OWNER | MEMBER
    status       VARCHAR(20) NOT NULL,            -- ACTIVE | LEFT | REMOVED
    joined_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    left_at      TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT uq_household_member UNIQUE (household_id, user_id)
);

-- v1 rule: a user may belong to at most ONE household at a time.
--
-- Enforced in HouseholdService (create/accept both reject an existing ACTIVE membership) and
-- covered by userCanOnlyBeInOneHouseholdAtATime. It is deliberately NOT a partial unique index
-- (`... WHERE status = 'ACTIVE'`): that is PostgreSQL-only syntax and these migrations also run
-- against H2 in the test context, where it fails and takes the whole ApplicationContext down.
-- Consequence: a race between two simultaneous accepts could theoretically place one user in
-- two households. That is a correctness wart, not a data-leak — access is still resolved per
-- household via requireActiveMember — and it can be hardened later with a Postgres-only
-- migration once vendor-specific Flyway locations are configured.
CREATE INDEX idx_household_member_user_status ON household_member (user_id, status);
CREATE INDEX idx_household_member_household ON household_member (household_id, status);

CREATE TABLE household_invite (
    id                 BIGSERIAL PRIMARY KEY,
    household_id       BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    invited_email      VARCHAR(255) NOT NULL,
    -- The raw invite token is NEVER stored: we keep a SHA-256 hash and compare hashes, so a
    -- database read cannot be replayed as a working invite link.
    token_hash         VARCHAR(128) NOT NULL,
    invited_by_user_id BIGINT NOT NULL,
    status             VARCHAR(20) NOT NULL,      -- PENDING | ACCEPTED | REVOKED | EXPIRED
    expires_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    accepted_at        TIMESTAMP WITHOUT TIME ZONE,
    accepted_user_id   BIGINT,
    CONSTRAINT uq_household_invite_token UNIQUE (token_hash)
);

CREATE INDEX idx_household_invite_household ON household_invite (household_id, status);
CREATE INDEX idx_household_invite_email ON household_invite (invited_email, status);
