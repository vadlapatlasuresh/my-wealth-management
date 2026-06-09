-- User-linked brokerage accounts + tracked alternative investments
-- (replaces browser-localStorage storage in InvestPage).
CREATE TABLE broker_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    broker_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(64),
    market_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
    connected BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    linked_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_broker_accounts_user ON broker_accounts (user_id);

CREATE TABLE alt_investments (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    type VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    current_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
    ownership_pct NUMERIC(7, 4),
    notes VARCHAR(1000),
    added_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_alt_investments_user ON alt_investments (user_id);
