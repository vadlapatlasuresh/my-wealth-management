-- Phase 4/5 hardening — make payroll/1099 and inventory real, and fix data integrity.
--
-- 1) FK cascade for the tables added in V32-34 (they had none, so deleting a business
--    orphaned inventory/contractor/team rows).
ALTER TABLE business_inventory_items
    ADD CONSTRAINT fk_inv_item_business FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE;
ALTER TABLE business_contractors
    ADD CONSTRAINT fk_contractor_business FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE;
ALTER TABLE business_team_members
    ADD CONSTRAINT fk_team_member_business FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE;

-- Team member: invite by email (owners don't know internal user ids). member_user_id is
-- resolved/filled once the invitee has an account.
ALTER TABLE business_team_members ADD COLUMN invited_email VARCHAR(255);
ALTER TABLE business_team_members ALTER COLUMN member_user_id DROP NOT NULL;

-- 2) Inventory movement ledger — one row per stock change, so postings are idempotent
--    (keyed on the movement id) and reversible, and stock has an auditable history.
CREATE TABLE business_inventory_movements (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    item_id BIGINT NOT NULL,
    kind VARCHAR(12) NOT NULL,                 -- RECEIVE | SELL | ADJUST
    delta INT NOT NULL,                        -- +in / -out (units)
    unit_cost NUMERIC(18, 2),                  -- cost per unit at the time
    note VARCHAR(300),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_inv_move_business FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_move_item FOREIGN KEY (item_id) REFERENCES business_inventory_items (id) ON DELETE CASCADE
);
CREATE INDEX idx_inv_move_item ON business_inventory_movements (item_id);

-- 3) Contractor payments — the record of what a contractor was actually paid (drives the
--    year-end 1099 totals and the ledger expense on payment).
CREATE TABLE business_contractor_payments (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    contractor_id BIGINT NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    paid_at DATE NOT NULL,
    method VARCHAR(40),
    reference VARCHAR(200),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_contractor_pay_business FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_contractor_pay_contractor FOREIGN KEY (contractor_id) REFERENCES business_contractors (id) ON DELETE CASCADE
);
CREATE INDEX idx_contractor_pay_contractor ON business_contractor_payments (contractor_id);
CREATE INDEX idx_contractor_pay_year ON business_contractor_payments (business_id, paid_at);

-- 4) Employees + payroll runs — real payroll: gross → withholdings → net, with paystub data
--    and a ledger posting. Withholding rates are owner-set ESTIMATES (not IRS tables).
CREATE TABLE business_employees (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    pay_type VARCHAR(10) NOT NULL DEFAULT 'SALARY',   -- SALARY | HOURLY
    pay_rate NUMERIC(18, 2) NOT NULL DEFAULT 0,        -- annual salary, or hourly rate
    fed_wh_pct NUMERIC(7, 4) NOT NULL DEFAULT 12,      -- estimated federal withholding %
    state_wh_pct NUMERIC(7, 4) NOT NULL DEFAULT 4,     -- estimated state withholding %
    fica_pct NUMERIC(7, 4) NOT NULL DEFAULT 7.65,      -- employee FICA %
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_employee_business FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE
);
CREATE INDEX idx_employee_biz ON business_employees (business_id, user_id, name);

CREATE TABLE business_payroll_runs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    employee_id BIGINT NOT NULL,
    period_start DATE,
    period_end DATE,
    hours NUMERIC(10, 2),                       -- for hourly runs
    gross NUMERIC(18, 2) NOT NULL,
    fed_wh NUMERIC(18, 2) NOT NULL DEFAULT 0,
    state_wh NUMERIC(18, 2) NOT NULL DEFAULT 0,
    fica NUMERIC(18, 2) NOT NULL DEFAULT 0,
    net NUMERIC(18, 2) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PAID',
    paid_at DATE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_payroll_run_business FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_payroll_run_employee FOREIGN KEY (employee_id) REFERENCES business_employees (id) ON DELETE CASCADE
);
CREATE INDEX idx_payroll_run_emp ON business_payroll_runs (employee_id);
CREATE INDEX idx_payroll_run_biz ON business_payroll_runs (business_id, paid_at);
