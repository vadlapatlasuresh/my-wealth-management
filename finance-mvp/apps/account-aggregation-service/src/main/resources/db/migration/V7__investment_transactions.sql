-- Brokerage trade/activity history synced from Plaid Investments transactions.
CREATE TABLE investment_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    plaid_investment_txn_id VARCHAR(255) NOT NULL UNIQUE,
    plaid_account_id VARCHAR(255) NOT NULL,
    security_id VARCHAR(255),
    symbol VARCHAR(64),
    name VARCHAR(255),
    broker VARCHAR(255),
    type VARCHAR(64),
    subtype VARCHAR(64),
    txn_date DATE NOT NULL,
    quantity DECIMAL(23, 8),
    price DECIMAL(19, 4),
    amount DECIMAL(19, 4),
    fees DECIMAL(19, 4),
    currency VARCHAR(10),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inv_txn_user_id ON investment_transactions (user_id);
