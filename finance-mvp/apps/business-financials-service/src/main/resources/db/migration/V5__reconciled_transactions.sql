-- Per-user reconciliation flags for transactions (linked or manual), keyed by a
-- stable external id string supplied by the client. Backs the "reconciled" status
-- in the business page's transaction tracker.
CREATE TABLE reconciled_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_reconciled_user_ext UNIQUE (user_id, external_id)
);
CREATE INDEX idx_reconciled_user ON reconciled_transactions (user_id);
