-- Procure-to-Pay, Phase 2b — purchase orders.
--
-- A PO is the buy-side counterpart of a quote: issued to a vendor, then converted (once
-- approved / goods received) into an accounts-payable Bill in one click. The PO itself does
-- NOT post to the ledger — only the Bill it becomes does — so a PO never affects the books
-- until it's real, exactly like a quote vs. an invoice.
CREATE TABLE business_purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,

    vendor VARCHAR(255) NOT NULL,
    po_number VARCHAR(60),
    expense_category VARCHAR(80),

    order_date DATE,
    expected_date DATE,

    amount NUMERIC(18, 2) NOT NULL,
    tax_amount NUMERIC(18, 2),

    -- DRAFT | SENT | APPROVED | RECEIVED | CONVERTED | CANCELLED
    status VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    notes VARCHAR(1000),

    converted_bill_id BIGINT,                    -- set once converted (business_bills.id)

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_biz_po_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE
);
CREATE INDEX idx_biz_po_user_biz ON business_purchase_orders (user_id, business_id);
