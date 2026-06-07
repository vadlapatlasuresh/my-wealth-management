CREATE TABLE deals (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    category VARCHAR(40) NOT NULL,          -- REAL_ESTATE | BUSINESS | PRIVATE_EQUITY | STARTUP | OTHER
    description VARCHAR(2000),
    location VARCHAR(200),
    target_raise DECIMAL(19, 4),
    min_investment DECIMAL(19, 4),
    target_irr DECIMAL(9, 4),               -- percentage, e.g. 18.5000
    hold_period_months INTEGER,
    status VARCHAR(20) NOT NULL,            -- DRAFT | OPEN | CLOSED | FUNDED
    amount_committed DECIMAL(19, 4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

CREATE INDEX idx_deals_user_id ON deals (user_id);
