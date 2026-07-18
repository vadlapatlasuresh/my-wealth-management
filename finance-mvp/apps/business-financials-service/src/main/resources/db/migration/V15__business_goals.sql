-- Per-business financial goals: a target cash reserve and a tax set-aside plan.
-- One row per (user, business). Backs the Goals card on MyBusinessPage.
CREATE TABLE business_goals (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    reserve_target NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    tax_set_aside NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_goal_user_biz UNIQUE (user_id, business_id)
);
CREATE INDEX idx_goal_user_biz ON business_goals (user_id, business_id);
