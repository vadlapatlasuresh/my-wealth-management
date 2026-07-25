-- Household income (Phase 3d): recurring income each member brings to the household.
--
-- Like household_goal and household_bill (V15), this is a NEW household-OWNED entity, not a shared
-- view of anyone's personal pay data. Nothing here reads or reinterprets an existing user_id-scoped
-- row, so joining a household never begins exposing personal accounts or transactions. A member
-- sees these because the household owns them, resolved through the single requireActiveMember rule.
--
-- Purpose: give the household an income figure to sit alongside its bills and savings, so the
-- Shared Money page can show income vs bills vs what's going to shared goals, and who contributes.
-- member_user_id attributes the income to a household member (the "who earns what" split), and is
-- always one of the household's own members — never a new class of principal.

CREATE TABLE household_income (
    id                 BIGSERIAL PRIMARY KEY,
    household_id       BIGINT NOT NULL REFERENCES household (id) ON DELETE CASCADE,
    member_user_id     BIGINT NOT NULL,          -- which household member earns it ("who earns what")
    source             VARCHAR(160) NOT NULL,    -- e.g. "Salary", "Rental", "Side business"
    amount             DECIMAL(19, 2) NOT NULL,  -- per-cadence gross the member logs
    cadence            VARCHAR(20) NOT NULL,     -- WEEKLY | MONTHLY | YEARLY
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id BIGINT NOT NULL,
    created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_household_income_household ON household_income (household_id);
