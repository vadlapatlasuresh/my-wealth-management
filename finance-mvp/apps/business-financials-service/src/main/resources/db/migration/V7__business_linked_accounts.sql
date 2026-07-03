-- Per-business assignment of linked (aggregation/Plaid) accounts, so the business
-- page shows only the accounts the user designates as business rather than their
-- entire aggregation. linked_account_id references the aggregation account id.
CREATE TABLE business_linked_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    linked_account_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_biz_linked_acct UNIQUE (user_id, business_id, linked_account_id)
);
CREATE INDEX idx_biz_linked_business ON business_linked_accounts (business_id, user_id);
