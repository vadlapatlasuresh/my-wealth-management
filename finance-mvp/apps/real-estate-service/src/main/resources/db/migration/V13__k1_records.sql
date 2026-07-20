-- Schedule K-1 tracking for private holdings.
--
-- A partnership issues K-1s long after year end, often past the filing deadline, and a
-- single missing form blocks the whole return. This table tracks which are outstanding per
-- holding per tax year so the user can chase the sponsor, and holds the figures they
-- transcribe once the form arrives.

CREATE TABLE k1_records (
    id BIGSERIAL PRIMARY KEY,
    holding_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    tax_year INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'EXPECTED',   -- EXPECTED | RECEIVED | NOT_APPLICABLE
    received_on DATE,
    document_url VARCHAR(500),
    -- Transcribed from the form the user holds; recorded, never computed or interpreted.
    ordinary_income DECIMAL(19, 2),                   -- box 1
    rental_income DECIMAL(19, 2),                     -- box 2
    distributions DECIMAL(19, 2),                     -- box 19
    notes VARCHAR(500),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_k1_records_holding
        FOREIGN KEY (holding_id) REFERENCES private_holdings (id) ON DELETE CASCADE
);
CREATE INDEX idx_k1_records_user_year ON k1_records (user_id, tax_year);
-- Expected records are generated on read, so this is what stops a concurrent read from
-- creating a second placeholder for the same holding and year.
CREATE UNIQUE INDEX uq_k1_records_holding_year ON k1_records (holding_id, tax_year);
