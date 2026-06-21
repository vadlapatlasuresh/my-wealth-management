-- Push device registration tokens. A user may have several (phone, laptop, …);
-- push notifications fan out to all of them. Tokens are unique and replaced on
-- re-registration.
CREATE TABLE device_token (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    token      VARCHAR(512) NOT NULL,
    platform   VARCHAR(20),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_device_token UNIQUE (token)
);

CREATE INDEX idx_device_token_user ON device_token (user_id);
