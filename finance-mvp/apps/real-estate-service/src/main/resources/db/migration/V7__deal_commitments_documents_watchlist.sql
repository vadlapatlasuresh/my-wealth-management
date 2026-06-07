-- Investor commitment amount + accreditation attestation on each interest.
ALTER TABLE deal_interests ADD COLUMN commitment_amount DECIMAL(19, 4);
ALTER TABLE deal_interests ADD COLUMN accredited BOOLEAN NOT NULL DEFAULT FALSE;

-- Link-based deal documents (PPM, financials, data room…).
CREATE TABLE deal_documents (
    id BIGSERIAL PRIMARY KEY,
    deal_id BIGINT NOT NULL,
    owner_user_id BIGINT NOT NULL,
    label VARCHAR(200) NOT NULL,
    url VARCHAR(500) NOT NULL,
    doc_type VARCHAR(40),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
);
CREATE INDEX idx_deal_documents_deal_id ON deal_documents (deal_id);

-- Investor watchlist (saved deals), unique per (user, deal).
CREATE TABLE deal_watches (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    deal_id BIGINT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT uq_deal_watch UNIQUE (user_id, deal_id)
);
CREATE INDEX idx_deal_watches_user_id ON deal_watches (user_id);
