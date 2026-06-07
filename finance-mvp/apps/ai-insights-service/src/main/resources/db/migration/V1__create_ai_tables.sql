CREATE TABLE insights (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    reason VARCHAR(2000) NOT NULL,
    severity VARCHAR(20) NOT NULL, -- INFO | WARNING | ACTIONABLE
    suggested_action VARCHAR(2000),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insights_user_id ON insights (user_id);
