-- User-defined auto-categorization rules. When a transaction's merchant name matches a
-- rule, the transaction is assigned the rule's category (keeps budget actuals precise).
CREATE TABLE category_rule (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    match_type VARCHAR(20)  NOT NULL,
    pattern    VARCHAR(200) NOT NULL,
    category   VARCHAR(80)  NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_category_rule_user ON category_rule (user_id);
