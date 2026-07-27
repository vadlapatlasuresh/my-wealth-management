-- Procure-to-Pay, Phase 2a — vendor bills (accounts payable).
--
-- The AP counterpart to invoices: record what the business owes vendors, when it's due, and
-- pay it (in full or part). Each bill posts to the general ledger — entered: DR expense /
-- CR Accounts Payable; paid: DR Accounts Payable / CR Cash — so AP shows on the Balance
-- Sheet and expenses on the P&L, exactly like the order-to-cash side.
CREATE TABLE business_bills (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,

    vendor VARCHAR(255) NOT NULL,
    bill_number VARCHAR(60),
    -- Which expense the bill hits (maps to a ledger expense account; defaults to Operating).
    expense_category VARCHAR(80),

    bill_date DATE,
    due_date DATE,
    scheduled_pay_date DATE,                     -- optional: when the owner plans to pay

    amount NUMERIC(18, 2) NOT NULL,              -- total owed
    tax_amount NUMERIC(18, 2),                   -- informational (included in amount)

    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',  -- OPEN | PARTIALLY_PAID | PAID | VOID
    notes VARCHAR(1000),

    /* ---- Payment ---- */
    paid_amount NUMERIC(18, 2),
    paid_at DATE,
    payment_method VARCHAR(40),
    payment_reference VARCHAR(200),

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_biz_bill_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE
);
CREATE INDEX idx_biz_bill_user_biz ON business_bills (user_id, business_id);
CREATE INDEX idx_biz_bill_due ON business_bills (business_id, due_date);
