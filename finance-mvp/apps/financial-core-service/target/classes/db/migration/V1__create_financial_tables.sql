CREATE TABLE budgets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    "month" VARCHAR(7) NOT NULL, -- YYYY-MM -- Quoted 'month'
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, "month") -- Quoted 'month' in UNIQUE constraint
);

CREATE TABLE budget_lines (
    id BIGSERIAL PRIMARY KEY,
    budget_id BIGINT NOT NULL,
    category VARCHAR(255) NOT NULL,
    amount DECIMAL(19, 4) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    FOREIGN KEY (budget_id) REFERENCES budgets (id) ON DELETE CASCADE
);

CREATE TABLE debts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    balance DECIMAL(19, 4) NOT NULL,
    apr DECIMAL(5, 2) NOT NULL,
    min_payment DECIMAL(19, 4) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE debt_scenarios (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    strategy VARCHAR(50) NOT NULL,
    extra_payment_monthly DECIMAL(19, 4) NOT NULL,
    months_to_debt_free INT NOT NULL,
    total_interest_paid DECIMAL(19, 4) NOT NULL,
    debt_free_date DATE,
    liquidity VARCHAR(50),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);
