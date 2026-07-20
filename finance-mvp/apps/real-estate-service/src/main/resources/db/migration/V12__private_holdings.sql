-- Private co-ownership positions the user already holds, and their capital accounts.
--
-- This is a bookkeeping ledger for interests bought directly from a sponsor, off-platform:
-- the Fractional LLC page records what the user owns rather than offering anything for sale.
-- Note there is no valuation, projected-return or offering column anywhere below — that is
-- deliberate, and is what keeps this feature on the right side of the Deal Room's posture.

CREATE TABLE private_holdings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    entity_type VARCHAR(30) NOT NULL,        -- LLC | LP | JV | SYNDICATION | FUND | OTHER
    asset_type VARCHAR(40),                  -- descriptive property type
    location VARCHAR(200),
    sponsor_name VARCHAR(200),
    sponsor_contact VARCHAR(320),
    external_url VARCHAR(500),
    units_held DECIMAL(19, 4),
    total_units DECIMAL(19, 4),
    committed_amount DECIMAL(19, 2),
    acquired_on DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | EXITED
    -- Back-reference to the directory listing this came from, when tracked from Deal Room.
    -- Intentionally NOT a foreign key: the poster may edit or delete their listing, and that
    -- must never cascade into the user's own record of what they own.
    source_deal_id BIGINT,
    notes VARCHAR(2000),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);
CREATE INDEX idx_private_holdings_user_id ON private_holdings (user_id);
-- One holding per listing per user, so "track it" is idempotent. Plain unique index
-- rather than a partial one: H2 (used by the tests) rejects a WHERE clause here, and it
-- is not needed — both H2 and Postgres treat NULLs as distinct, so the many holdings
-- added by hand (source_deal_id IS NULL) are unaffected by this constraint.
CREATE UNIQUE INDEX uq_private_holdings_user_deal
    ON private_holdings (user_id, source_deal_id);

CREATE TABLE private_holding_entries (
    id BIGSERIAL PRIMARY KEY,
    holding_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    direction VARCHAR(20) NOT NULL,          -- CONTRIBUTION | DISTRIBUTION
    -- CONTRIBUTION: INITIAL | CAPITAL_CALL
    -- DISTRIBUTION: RENTAL_INCOME | RETURN_OF_CAPITAL | CAPITAL_GAIN | REFINANCE | SALE_PROCEEDS
    category VARCHAR(30) NOT NULL,
    amount DECIMAL(19, 2) NOT NULL,
    occurred_on DATE NOT NULL,
    note VARCHAR(500),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_holding_entries_holding
        FOREIGN KEY (holding_id) REFERENCES private_holdings (id) ON DELETE CASCADE
);
CREATE INDEX idx_holding_entries_holding_id ON private_holding_entries (holding_id);
CREATE INDEX idx_holding_entries_user_id ON private_holding_entries (user_id);
