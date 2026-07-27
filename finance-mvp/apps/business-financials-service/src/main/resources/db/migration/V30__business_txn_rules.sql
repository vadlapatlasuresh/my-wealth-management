-- Bank feeds & categorization, Phase 3a — transaction rules.
--
-- User-defined rules that auto-classify transactions into a category by matching the
-- merchant or description. Applied when a transaction is recorded, and on demand to existing
-- uncategorized transactions. Rules are tried in priority (position) order; first match wins.
CREATE TABLE business_txn_rules (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,

    match_field VARCHAR(16) NOT NULL DEFAULT 'MERCHANT',  -- MERCHANT | DESCRIPTION
    match_type VARCHAR(16) NOT NULL DEFAULT 'CONTAINS',   -- CONTAINS | EQUALS | STARTS_WITH
    match_value VARCHAR(200) NOT NULL,
    set_category VARCHAR(80) NOT NULL,

    position INT NOT NULL DEFAULT 0,                       -- lower = higher priority
    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_biz_txn_rule_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE
);
CREATE INDEX idx_biz_txn_rule_user_biz ON business_txn_rules (user_id, business_id, position);
