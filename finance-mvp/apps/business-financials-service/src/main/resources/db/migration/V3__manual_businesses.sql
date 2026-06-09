-- User-entered businesses + their accounts (replaces browser-localStorage storage in MyBusinessPage).
CREATE TABLE manual_businesses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(255),
    entity_type VARCHAR(64),
    ein VARCHAR(64),
    revenue_mtd NUMERIC(18, 2),
    expenses_mtd NUMERIC(18, 2),
    outstanding_invoices NUMERIC(18, 2),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_manual_businesses_user ON manual_businesses (user_id);

CREATE TABLE business_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    institution VARCHAR(255),
    type VARCHAR(32),
    balance NUMERIC(18, 2),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_business_accounts_business ON business_accounts (business_id, user_id);
