-- Durable cross-service delete-cascade (GDPR/CCPA right-to-delete). One row per
-- (user, target service). A failed purge stays PENDING and is retried by a
-- scheduled job, so a downstream service being momentarily down never leaves
-- orphaned user data behind. Audit logs are intentionally NOT a purge target.
CREATE TABLE user_deletion_task (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    target      VARCHAR(255) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | DONE | FAILED
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  VARCHAR(1000),
    created_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_deletion_task_user_target UNIQUE (user_id, target)
);

CREATE INDEX idx_deletion_task_status ON user_deletion_task (status);
