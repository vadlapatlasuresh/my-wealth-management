-- Saved tax inputs, one per user, so the educational estimate persists across sessions.
CREATE TABLE tax_profile (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL,
    tax_year            INTEGER NOT NULL,
    filing_status       VARCHAR(30),
    gross_income        NUMERIC(14,2),
    adjustments         NUMERIC(14,2),
    itemized_deductions NUMERIC(14,2),
    dependents_under_17 INTEGER,
    withholding         NUMERIC(14,2),
    updated_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tax_profile_user UNIQUE (user_id)
);
