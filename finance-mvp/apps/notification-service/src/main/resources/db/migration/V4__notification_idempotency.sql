-- Persistent idempotency for notification dispatch (survives restarts + multi-instance).
-- A (user, key) row is reserved BEFORE dispatch; the UNIQUE constraint makes a concurrent
-- or replayed request fail to insert -> treated as an idempotent replay (no double-send).
CREATE TABLE notification_idempotency (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    idempotency_key VARCHAR(200) NOT NULL,
    created_at      TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_idempotency UNIQUE (user_id, idempotency_key)
);
