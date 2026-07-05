-- Goals gain real account linking + a manual contribution ledger + automatic tracking mode.
--
-- tracking_mode controls how a goal's *auto* progress is derived from its linked accounts:
--   MANUAL        - ignore linked balances; only the stored current_amount + manual ledger count.
--   BALANCE       - the full current balance of each linked account counts toward the goal.
--   CONTRIBUTIONS - only growth since the account was linked (balance - baseline) counts.
-- Existing goals default to MANUAL so their behaviour is unchanged.
ALTER TABLE goals ADD COLUMN tracking_mode VARCHAR(20) NOT NULL DEFAULT 'MANUAL';

-- Optional display currency for the goal; used to flag/skip linked accounts in a different currency.
ALTER TABLE goals ADD COLUMN currency VARCHAR(3);

-- Which savings/cash accounts fund a goal. Many-to-many: a goal may draw on several accounts and an
-- account may fund several goals (goals are aspirational buckets, not a partition of the balance).
CREATE TABLE goal_account_links (
    id             BIGSERIAL PRIMARY KEY,
    goal_id        BIGINT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
    user_id        BIGINT NOT NULL,
    account_id     BIGINT NOT NULL,          -- account-aggregation account id
    account_name   VARCHAR(255),             -- cached label so the link is readable even if aggregation is down
    baseline_amount DECIMAL(19, 4) NOT NULL DEFAULT 0, -- balance at link time (for CONTRIBUTIONS mode)
    last_balance   DECIMAL(19, 4),           -- last-seen balance; used when live fetch fails
    currency       VARCHAR(3),
    created_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_goal_account UNIQUE (goal_id, account_id)
);

CREATE INDEX idx_goal_links_goal ON goal_account_links (goal_id);
CREATE INDEX idx_goal_links_user ON goal_account_links (user_id);

-- Manual contribution ledger — an append-only history of hand-entered top-ups toward a goal.
-- Each row also bumps goals.current_amount so the stored "manual saved" total stays authoritative.
CREATE TABLE goal_contributions (
    id         BIGSERIAL PRIMARY KEY,
    goal_id    BIGINT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL,
    amount     DECIMAL(19, 4) NOT NULL,      -- may be negative to correct a mistake
    note       VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goal_contrib_goal ON goal_contributions (goal_id);
