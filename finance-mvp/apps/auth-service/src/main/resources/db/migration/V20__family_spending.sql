-- Phase 5 (backlog B3, extension): kids' cards, budgets & spending.
--
-- WHY THIS IS SAFE — the same boundary V18 draws, extended:
--
-- A child is still NOT a user account. Cards, budgets and transactions here are records the
-- HOUSEHOLD owns, resolved through the one HouseholdService.requireActiveMember rule — exactly
-- like family_member and family_ledger_entry.
--
-- The cards a kid "uses" are the GUARDIAN's own linked (Plaid) cards. We never give a child access
-- to anything, and we never let one guardian read another user's live bank feed. Instead:
--   * only the guardian who OWNS a linked card may attach it to a child (linked_owner_user_id),
--   * a sync pulls THAT guardian's own transactions from account-aggregation-service (server-to-
--     server, their own user_id), applies the household's rules, and MATERIALIZES matches as
--     household-owned family_transaction rows.
-- So both guardians read household-owned copies; nobody reads another user's aggregation data.
-- This keeps the ~59 user_id authorization surfaces (SHARED_HOUSEHOLD_DESIGN) untouched.

-- A card a child uses. LINKED = one of a guardian's real accounts (linked_account_id is the
-- account id in account-aggregation-service, linked_owner_user_id the guardian who owns it).
-- MANUAL = a card with no bank link, tracked by hand.
CREATE TABLE family_card (
    id                    BIGSERIAL PRIMARY KEY,
    household_id          BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    family_member_id      BIGINT NOT NULL REFERENCES family_member (id) ON DELETE CASCADE,
    label                 VARCHAR(120) NOT NULL,   -- e.g. "Robin's debit"
    last4                 VARCHAR(8),
    source_type           VARCHAR(10) NOT NULL DEFAULT 'MANUAL',  -- LINKED | MANUAL
    linked_account_id     BIGINT,                  -- account id in account-aggregation-service
    linked_owner_user_id  BIGINT,                  -- the guardian who owns that linked account
    created_by_user_id    BIGINT NOT NULL,
    created_at            TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_family_card_household ON family_card (household_id);
CREATE INDEX idx_family_card_member ON family_card (family_member_id);

-- How incoming transactions get bucketed to a child. CARD routes an entire card; LOCATION matches
-- a merchant/location substring (case-insensitive). Both assign to a spend bucket.
CREATE TABLE family_txn_rule (
    id                 BIGSERIAL PRIMARY KEY,
    household_id       BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    family_member_id   BIGINT NOT NULL REFERENCES family_member (id) ON DELETE CASCADE,
    match_type         VARCHAR(10) NOT NULL,       -- CARD | LOCATION
    card_id            BIGINT REFERENCES family_card (id) ON DELETE CASCADE,
    location_match     VARCHAR(160),               -- merchant/location substring for LOCATION rules
    bucket             VARCHAR(20) NOT NULL DEFAULT 'SPEND',
    created_by_user_id BIGINT NOT NULL,
    created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_family_txn_rule_household ON family_txn_rule (household_id);
CREATE INDEX idx_family_txn_rule_member ON family_txn_rule (family_member_id);

-- A monthly spending budget. family_member_id NULL = a whole-family budget (all children).
CREATE TABLE family_budget (
    id                 BIGSERIAL PRIMARY KEY,
    household_id       BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    family_member_id   BIGINT REFERENCES family_member (id) ON DELETE CASCADE,  -- NULL = whole family
    category           VARCHAR(80) NOT NULL,       -- e.g. "Food", "Fun", "All"
    monthly_limit      DECIMAL(19, 2) NOT NULL,
    created_by_user_id BIGINT NOT NULL,
    created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_family_budget_household ON family_budget (household_id);

-- A child's spend transaction — household-owned. LINKED_SYNC rows are materialized copies of a
-- guardian's own aggregation transactions (external_id = the source plaid_transaction_id, unique
-- per household so re-syncing never double-counts). MANUAL rows are entered by hand.
CREATE TABLE family_transaction (
    id                 BIGSERIAL PRIMARY KEY,
    household_id       BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    family_member_id   BIGINT NOT NULL REFERENCES family_member (id) ON DELETE CASCADE,
    card_id            BIGINT REFERENCES family_card (id) ON DELETE SET NULL,
    external_id        VARCHAR(255),               -- source plaid_transaction_id for LINKED_SYNC rows
    source             VARCHAR(20) NOT NULL DEFAULT 'MANUAL',  -- LINKED_SYNC | MANUAL
    merchant           VARCHAR(200),
    category           VARCHAR(80),
    amount             DECIMAL(19, 2) NOT NULL,    -- positive = money the child spent
    location           VARCHAR(200),
    occurred_on        DATE NOT NULL,
    bucket             VARCHAR(20) NOT NULL DEFAULT 'SPEND',
    created_by_user_id BIGINT NOT NULL,
    created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_family_txn_external UNIQUE (household_id, external_id)
);

CREATE INDEX idx_family_transaction_household ON family_transaction (household_id);
CREATE INDEX idx_family_transaction_member ON family_transaction (family_member_id);
