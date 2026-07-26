-- Order-to-Cash, Phase 1.3 — customer quotes / estimates that convert to invoices.
--
-- A quote mirrors an invoice's shape (customer + itemized money breakdown) but lives in
-- its OWN table so it never leaks into accounts-receivable. AR aggregations count unpaid
-- invoices; a quote is a proposal, not money owed, so keeping it separate means every
-- existing AR query, the dashboard and reconciliation stay correct with no changes.
--
-- One-click convert (see ManualBusinessController) creates a real business_invoice + its
-- line items from an ACCEPTED/any quote, stamps the quote CONVERTED and records the new
-- invoice id in converted_invoice_id.
CREATE TABLE business_quotes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    customer_id BIGINT,                        -- optional saved customer (FK SET NULL)

    customer VARCHAR(255) NOT NULL,            -- inline snapshot (render source of truth)
    customer_email VARCHAR(255),
    customer_phone VARCHAR(40),

    quote_number VARCHAR(60),
    -- DRAFT | SENT | ACCEPTED | DECLINED | EXPIRED | CONVERTED
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    issued_at DATE,
    expiry_date DATE,

    -- Money breakdown (same rules as invoices; amount is the grand total).
    subtotal NUMERIC(18, 2),
    discount_type VARCHAR(8),                  -- NULL | AMOUNT | PERCENT
    discount_value NUMERIC(18, 4),
    discount_amount NUMERIC(18, 2),
    tax_rate NUMERIC(7, 4),
    tax_amount NUMERIC(18, 2),
    amount NUMERIC(18, 2) NOT NULL DEFAULT 0,  -- grand total of the quote

    notes VARCHAR(1000),
    share_token VARCHAR(64),                   -- minted on first send (public quote view)
    sent_at TIMESTAMP WITHOUT TIME ZONE,
    sent_channel VARCHAR(16),

    converted_invoice_id BIGINT,               -- set once converted (points at business_invoices.id)
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_biz_quote_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_biz_quote_customer
        FOREIGN KEY (customer_id) REFERENCES business_customers (id) ON DELETE SET NULL
);
CREATE INDEX idx_biz_quote_user_biz ON business_quotes (user_id, business_id);
CREATE INDEX idx_biz_quote_customer ON business_quotes (customer_id);

CREATE TABLE business_quote_line_items (
    id BIGSERIAL PRIMARY KEY,
    quote_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    description VARCHAR(500) NOT NULL,
    quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
    unit_price NUMERIC(18, 4) NOT NULL DEFAULT 0,
    amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_quote_line_quote
        FOREIGN KEY (quote_id) REFERENCES business_quotes (id) ON DELETE CASCADE
);
CREATE INDEX idx_quote_line_quote ON business_quote_line_items (quote_id, position);
CREATE INDEX idx_quote_line_user ON business_quote_line_items (user_id);
