-- Phase 5 (backlog B3): Family / kids mode — allowance, buckets, chores, guardian view.
--
-- THE KEY DESIGN DECISION, and why it is safe:
--
-- A child here is NOT a user account. They are a record the HOUSEHOLD owns, exactly like
-- household_goal and household_bill in V15. That matters because of the finding in
-- docs/designs/SHARED_HOUSEHOLD_DESIGN.md: the JWT subject is the user id, and ~59 user_id
-- columns across 10 services authorize with `WHERE user_id = :me`. Introducing a second class
-- of principal — a "child user" whose data a guardian may read — would mean auditing every one
-- of those queries, and a single miss is a cross-account leak.
--
-- So v1 gives guardians a ledger they maintain on the child's behalf. No child logins, no new
-- token type, no change to any existing scoping rule. `member_user_id` is reserved (nullable,
-- unused) for the eventual teen-with-their-own-login step, which is a deliberate, separately
-- designed piece of work — not something to fall into by accident.
--
-- Authorization is therefore the SAME single rule as the rest of the household feature:
-- HouseholdService.requireActiveMember(caller, household). One method, one place to get right.

CREATE TABLE family_member (
    id                  BIGSERIAL PRIMARY KEY,
    household_id        BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    name                VARCHAR(120) NOT NULL,
    birth_year          INT,                     -- optional; only used for an age label
    -- RESERVED for a future teen-with-own-login. Nothing reads it today; see the note above.
    member_user_id      BIGINT,
    allowance_amount    DECIMAL(19, 2) NOT NULL DEFAULT 0,
    allowance_cadence   VARCHAR(20) NOT NULL DEFAULT 'WEEKLY',  -- WEEKLY | BIWEEKLY | MONTHLY
    allowance_day       INT,                     -- day of week (1-7) or of month (1-28)
    -- Spend / Save / Give split, in percent. Enforced to sum to 100 by the service.
    split_spend_pct     INT NOT NULL DEFAULT 100,
    split_save_pct      INT NOT NULL DEFAULT 0,
    split_give_pct      INT NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | ARCHIVED
    created_by_user_id  BIGINT NOT NULL,
    created_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_family_member_household ON family_member (household_id);

-- Every money movement for a child, append-only. Balances are DERIVED from this ledger rather
-- than stored on family_member: a stored balance and a ledger disagree eventually, and when a
-- parent and a ten-year-old disagree about pocket money, the ledger has to be the truth.
CREATE TABLE family_ledger_entry (
    id                  BIGSERIAL PRIMARY KEY,
    family_member_id    BIGINT NOT NULL REFERENCES family_member (id) ON DELETE CASCADE,
    entry_type          VARCHAR(20) NOT NULL,    -- ALLOWANCE | CHORE | GIFT | SPEND | ADJUSTMENT
    bucket              VARCHAR(10) NOT NULL,    -- SPEND | SAVE | GIVE
    amount              DECIMAL(19, 2) NOT NULL, -- signed: + adds to the bucket, - takes out
    occurred_on         DATE NOT NULL,
    note                VARCHAR(255),
    created_by_user_id  BIGINT NOT NULL,
    created_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_family_ledger_member ON family_ledger_entry (family_member_id);

CREATE TABLE family_chore (
    id                  BIGSERIAL PRIMARY KEY,
    family_member_id    BIGINT NOT NULL REFERENCES family_member (id) ON DELETE CASCADE,
    title               VARCHAR(160) NOT NULL,
    reward_amount       DECIMAL(19, 2) NOT NULL DEFAULT 0,
    completed_at        TIMESTAMP WITHOUT TIME ZONE,   -- NULL = still outstanding
    created_by_user_id  BIGINT NOT NULL,
    created_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_family_chore_member ON family_chore (family_member_id);
