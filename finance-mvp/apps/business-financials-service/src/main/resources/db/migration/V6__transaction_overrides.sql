-- Per-user overrides for a transaction's type and tags (linked or manual),
-- keyed by the same stable external id used for reconciliation. Backs the
-- inline type/tag editor in the business page's transaction tracker.
CREATE TABLE transaction_overrides (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    override_type VARCHAR(64),
    tags VARCHAR(512),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tx_override_user_ext UNIQUE (user_id, external_id)
);
CREATE INDEX idx_tx_override_user ON transaction_overrides (user_id);
