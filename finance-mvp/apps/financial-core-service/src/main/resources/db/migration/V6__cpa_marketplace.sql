-- CPA marketplace: a vetted directory of tax/accounting professionals members can browse,
-- connect with, and review. Mirrors the real-estate "Deal Room" directory pattern.

CREATE TABLE cpa_profile (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(200) NOT NULL,
    firm             VARCHAR(200),
    credentials      VARCHAR(120),
    license_state    VARCHAR(40),
    license_number   VARCHAR(80),
    license_verified BOOLEAN NOT NULL DEFAULT FALSE,
    specialties      VARCHAR(500),
    location         VARCHAR(200),
    fee_model        VARCHAR(80),
    years_experience INTEGER NOT NULL DEFAULT 0,
    bio              VARCHAR(2000),
    photo_url        VARCHAR(500),
    rating_avg       NUMERIC(3,2),
    review_count     INTEGER NOT NULL DEFAULT 0
);

-- A member's connection to a CPA (gates reviewing). One row per (cpa, user).
CREATE TABLE cpa_connection (
    id         BIGSERIAL PRIMARY KEY,
    cpa_id     BIGINT NOT NULL,
    user_id    BIGINT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cpa_connection_cpa_user UNIQUE (cpa_id, user_id)
);

CREATE INDEX idx_cpa_connection_cpa_id  ON cpa_connection (cpa_id);
CREATE INDEX idx_cpa_connection_user_id ON cpa_connection (user_id);

-- A member's review of a CPA.
CREATE TABLE cpa_review (
    id         BIGSERIAL PRIMARY KEY,
    cpa_id     BIGINT NOT NULL,
    user_id    BIGINT NOT NULL,
    rating     INTEGER NOT NULL,
    comment    VARCHAR(1000),
    verified   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cpa_review_cpa_id  ON cpa_review (cpa_id);
CREATE INDEX idx_cpa_review_user_id ON cpa_review (user_id);
