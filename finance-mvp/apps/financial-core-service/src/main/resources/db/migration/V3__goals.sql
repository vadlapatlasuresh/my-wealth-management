-- Member financial goals (savings, debt payoff, target net worth, custom).
CREATE TABLE goals (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    goal_type VARCHAR(50) NOT NULL DEFAULT 'SAVINGS', -- SAVINGS | DEBT_PAYOFF | NET_WORTH | CUSTOM
    target_amount DECIMAL(19, 4) NOT NULL,
    current_amount DECIMAL(19, 4) NOT NULL DEFAULT 0,
    target_date DATE,
    monthly_contribution DECIMAL(19, 4),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goals_user ON goals (user_id);
