-- Brokerage holdings synced from Plaid Investments. One row per
-- (user, plaid account, security); security details are denormalized so the
-- Investments UI renders without a join.
CREATE TABLE holdings (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    plaid_account_id VARCHAR(255) NOT NULL,
    security_id VARCHAR(255) NOT NULL,
    symbol VARCHAR(64),
    name VARCHAR(255),
    security_type VARCHAR(64),
    broker VARCHAR(255),
    quantity DECIMAL(23, 8),
    price DECIMAL(19, 4),
    market_value DECIMAL(19, 4),
    cost_basis DECIMAL(19, 4),
    currency VARCHAR(10),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_holding_user_account_security UNIQUE (user_id, plaid_account_id, security_id)
);

CREATE INDEX idx_holdings_user_id ON holdings (user_id);
