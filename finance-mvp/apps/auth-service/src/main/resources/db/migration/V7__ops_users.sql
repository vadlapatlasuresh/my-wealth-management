-- Ops (internal staff) identity — deliberately SEPARATE from the customer `users` table.
--
-- An ops agent is never a customer row. There is no promotion path from `users` to `ops_users`,
-- no shared credential, and no shared login route. Tokens minted for these accounts carry a
-- `typ=ops` claim which every member route rejects (and vice-versa) — see JwtAuthFilter.
CREATE TABLE ops_users (
    id                    BIGSERIAL PRIMARY KEY,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    password_hash         VARCHAR(255) NOT NULL,
    name                  VARCHAR(255),
    phone                 VARCHAR(64),
    -- MFA is mandatory for ops accounts; this only selects the delivery channel.
    mfa_channel           VARCHAR(10) NOT NULL DEFAULT 'EMAIL',
    active                BOOLEAN NOT NULL DEFAULT TRUE,
    -- Ops logins lock out far more aggressively than member logins: these accounts can
    -- read every customer's data, so a slow brute-force is worth stopping early.
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until          TIMESTAMP WITHOUT TIME ZONE,
    last_login_at         TIMESTAMP WITHOUT TIME ZONE,
    created_by            VARCHAR(64),
    created_at            TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE ops_user_roles (
    ops_user_id BIGINT NOT NULL,
    roles       VARCHAR(64) NOT NULL,
    PRIMARY KEY (ops_user_id, roles),
    FOREIGN KEY (ops_user_id) REFERENCES ops_users (id) ON DELETE CASCADE
);
