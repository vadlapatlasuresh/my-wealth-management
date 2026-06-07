CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    type VARCHAR(20) NOT NULL,        -- BUDGET|PAYMENT|ACCOUNT|SYSTEM
    title VARCHAR(255) NOT NULL,
    body TEXT,
    channel VARCHAR(20) NOT NULL,     -- EMAIL|PUSH|INAPP
    is_read BOOLEAN NOT NULL DEFAULT FALSE, -- 'read' is reserved; column is is_read
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    weekly_summary BOOLEAN NOT NULL DEFAULT TRUE,
    budget_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    payment_alerts BOOLEAN NOT NULL DEFAULT TRUE
);
