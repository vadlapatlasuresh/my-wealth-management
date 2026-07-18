-- Per-business monthly spending budgets, one row per (user, business, category).
-- Backs the Budgets & variance card on MyBusinessPage: the user sets a monthly
-- limit per expense category and the UI compares it against actual spend.
CREATE TABLE business_budgets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    category VARCHAR(128) NOT NULL,
    monthly_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_budget_user_biz_cat UNIQUE (user_id, business_id, category)
);
CREATE INDEX idx_budget_user_biz ON business_budgets (user_id, business_id);
