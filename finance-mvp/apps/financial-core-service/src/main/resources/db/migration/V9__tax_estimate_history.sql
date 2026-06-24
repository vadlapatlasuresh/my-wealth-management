-- Tax estimate history: the latest computed estimate per user per tax year, upserted on each
-- calculation. Powers the year-over-year view (AGI, tax, effective rate, refund/owed trend).

CREATE TABLE tax_estimate_snapshot (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL,
    tax_year       INTEGER NOT NULL,
    filing_status  VARCHAR(30),
    gross_income   NUMERIC(14,2),
    agi            NUMERIC(14,2),
    taxable_income NUMERIC(14,2),
    total_tax      NUMERIC(14,2),
    effective_rate NUMERIC(6,4),
    marginal_rate  NUMERIC(6,4),
    withholding    NUMERIC(14,2),
    refund_or_owed NUMERIC(14,2),
    updated_at     TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tax_estimate_user_year UNIQUE (user_id, tax_year)
);

CREATE INDEX idx_tax_estimate_user ON tax_estimate_snapshot (user_id);
