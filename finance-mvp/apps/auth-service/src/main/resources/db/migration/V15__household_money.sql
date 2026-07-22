-- Phase 3b: household-OWNED goals & bills. See docs/designs/SHARED_HOUSEHOLD_DESIGN.md.
--
-- These are NEW entities owned by the household — not shared views of anyone's personal goals.
-- That is the whole point: nothing here reads or reinterprets an existing user_id-scoped row,
-- so no existing personal data can start leaking. A member sees these because the household
-- owns them, resolved through the single requireActiveMember rule.
--
-- Co-located with household membership (rather than financial-core, as the design doc first
-- sketched) so authorization stays ONE in-process method call. Resolving membership across a
-- service boundary would add a second place to get authorization wrong, plus a fail-open risk
-- if that call errored.

CREATE TABLE household_goal (
    id                 BIGSERIAL PRIMARY KEY,
    household_id       BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    name               VARCHAR(160) NOT NULL,
    target_amount      DECIMAL(19, 2) NOT NULL,
    target_date        DATE,
    created_by_user_id BIGINT NOT NULL,
    created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_household_goal_household ON household_goal (household_id);

CREATE TABLE household_goal_contribution (
    id                 BIGSERIAL PRIMARY KEY,
    household_goal_id  BIGINT NOT NULL REFERENCES household_goal (id) ON DELETE CASCADE,
    user_id            BIGINT NOT NULL,          -- who put the money in
    amount             DECIMAL(19, 2) NOT NULL,
    occurred_on        DATE NOT NULL,
    note               VARCHAR(255),
    created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_household_goal_contrib_goal ON household_goal_contribution (household_goal_id);

CREATE TABLE household_bill (
    id                 BIGSERIAL PRIMARY KEY,
    household_id       BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    name               VARCHAR(160) NOT NULL,
    amount             DECIMAL(19, 2) NOT NULL,
    cadence            VARCHAR(20) NOT NULL,     -- MONTHLY | WEEKLY | YEARLY
    due_day            INT,                      -- day of month/week, advisory
    created_by_user_id BIGINT NOT NULL,
    created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_household_bill_household ON household_bill (household_id);

CREATE TABLE household_bill_payment (
    id                 BIGSERIAL PRIMARY KEY,
    household_bill_id  BIGINT NOT NULL REFERENCES household_bill (id) ON DELETE CASCADE,
    paid_by_user_id    BIGINT NOT NULL,          -- powers "who paid what"
    amount             DECIMAL(19, 2) NOT NULL,
    paid_on            DATE NOT NULL,
    created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_household_bill_payment_bill ON household_bill_payment (household_bill_id);
