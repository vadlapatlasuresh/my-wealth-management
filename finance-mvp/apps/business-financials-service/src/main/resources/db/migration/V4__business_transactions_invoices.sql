-- Credit-card metadata + real per-account transactions + trackable invoices.
-- Backs the redesigned MyBusinessPage (typed accounts, transaction filtering,
-- Credit Card & Expenses / Business Tools tabs).

-- Credit limit lets us render utilization + available credit for CREDIT_CARD accounts.
ALTER TABLE business_accounts ADD COLUMN credit_limit NUMERIC(18, 2);

-- Real, persisted transactions for each business account.
-- amount convention: negative = money out (charge/expense), positive = money in (deposit/payment).
CREATE TABLE business_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    description VARCHAR(255) NOT NULL,
    merchant VARCHAR(255),
    category VARCHAR(64),
    amount NUMERIC(18, 2) NOT NULL,
    posted_at DATE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_business_tx_account  ON business_transactions (account_id, user_id);
CREATE INDEX idx_business_tx_business ON business_transactions (business_id, user_id);

-- Trackable invoices (create / send / track) + pending-payment surfacing.
-- status: OPEN | PAID | OVERDUE
CREATE TABLE business_invoices (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    customer VARCHAR(255) NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    issued_at DATE,
    due_date DATE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_business_invoices_business ON business_invoices (business_id, user_id);
