-- Order-to-Cash, Phase 1.7 — sales tax / VAT rate engine (flat / manual per-jurisdiction).
--
-- The business owner defines tax rates by jurisdiction (a flat percent scoped to a country /
-- region / postal, or a default). When an invoice is addressed to a saved customer, the best
-- matching rate is resolved from their billing location and applied to the line-item subtotal
-- (the existing invoice.tax_rate / tax_amount fields). No external tax API — rates are
-- owner-maintained, matching the agreed approach.
CREATE TABLE business_tax_rates (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,

    name VARCHAR(120) NOT NULL,          -- e.g. "CA Sales Tax", "VAT 20%"
    rate NUMERIC(7, 4) NOT NULL,         -- percent, e.g. 8.2500

    -- Jurisdiction scope (any may be null = "any"). Matching prefers the most specific.
    country VARCHAR(2),                  -- ISO-3166 alpha-2
    region VARCHAR(120),                 -- state / province (matched case-insensitively)
    postal VARCHAR(24),                  -- exact postal / ZIP

    is_default BOOLEAN NOT NULL DEFAULT FALSE,   -- fallback when nothing else matches
    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_biz_tax_rate_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE
);
CREATE INDEX idx_biz_tax_rate_user_biz ON business_tax_rates (user_id, business_id);
