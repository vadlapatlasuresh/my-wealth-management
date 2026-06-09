-- Centralized secret store. Values are stored ONLY as AES-256-GCM ciphertext under a
-- per-version DEK, which is itself stored only KEK-wrapped. No plaintext is ever persisted.

CREATE TABLE secret (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(200) NOT NULL UNIQUE,
    scope         VARCHAR(100) NOT NULL,
    description   VARCHAR(500),
    rotation_days INT,
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_secret_scope ON secret(scope);

CREATE TABLE secret_version (
    id          BIGSERIAL PRIMARY KEY,
    secret_id   BIGINT NOT NULL REFERENCES secret(id),
    version     INT NOT NULL,
    ciphertext  TEXT NOT NULL,        -- Base64(IV || ciphertext || GCM tag) under the DEK
    wrapped_dek TEXT NOT NULL,        -- KEK-wrapped DEK for this version
    status      VARCHAR(20) NOT NULL, -- ACTIVE | PREVIOUS | RETIRED
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_secret_version UNIQUE (secret_id, version)
);
CREATE INDEX idx_version_secret_status ON secret_version(secret_id, status);

CREATE TABLE secret_grant (
    id         BIGSERIAL PRIMARY KEY,
    principal  VARCHAR(120) NOT NULL,  -- calling service identity
    scope      VARCHAR(100) NOT NULL,  -- scope it may access
    permission VARCHAR(20)  NOT NULL,  -- READ | WRITE | ROTATE
    CONSTRAINT uq_grant UNIQUE (principal, scope, permission)
);
CREATE INDEX idx_grant_principal ON secret_grant(principal);
