-- Order-to-Cash, Phase 1.2 — customizable invoice line items with subtotal / discount /
-- tax / total calculation.
--
-- Until now an invoice was a single `amount`. This adds itemized lines and the money
-- breakdown QuickBooks-style invoicing needs. Back-compat is preserved by keeping
-- business_invoices.amount as the authoritative GRAND TOTAL (what the customer owes) —
-- every existing AR aggregation, the public page and reconciliation keep reading it
-- unchanged. When line items are present the total is computed from them; legacy and
-- one-off invoices with no lines keep their directly-entered amount.
CREATE TABLE business_invoice_line_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    position INT NOT NULL DEFAULT 0,            -- display order within the invoice
    description VARCHAR(500) NOT NULL,
    quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
    unit_price NUMERIC(18, 4) NOT NULL DEFAULT 0,
    -- Line total = quantity * unit_price (persisted so historical lines never drift if the
    -- rounding rule changes). Always non-null.
    amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_invoice_line_invoice
        FOREIGN KEY (invoice_id) REFERENCES business_invoices (id) ON DELETE CASCADE
);
CREATE INDEX idx_invoice_line_invoice ON business_invoice_line_items (invoice_id, position);
CREATE INDEX idx_invoice_line_user ON business_invoice_line_items (user_id);

-- Money breakdown on the invoice. All nullable so untouched legacy rows read as "no
-- itemization" (subtotal/tax/discount simply absent) while `amount` stays the total.
-- One ADD COLUMN per statement for portability (H2 in tests rejects a multi-column ADD).
ALTER TABLE business_invoices ADD COLUMN subtotal NUMERIC(18, 2);        -- sum of line amounts (pre-discount/tax)
ALTER TABLE business_invoices ADD COLUMN discount_type VARCHAR(8);       -- NULL | AMOUNT | PERCENT
ALTER TABLE business_invoices ADD COLUMN discount_value NUMERIC(18, 4);  -- the entered number (an amount or a percent)
ALTER TABLE business_invoices ADD COLUMN discount_amount NUMERIC(18, 2); -- computed absolute discount applied
ALTER TABLE business_invoices ADD COLUMN tax_rate NUMERIC(7, 4);         -- percent, e.g. 8.2500 (populated by 1.7 tax engine later)
ALTER TABLE business_invoices ADD COLUMN tax_amount NUMERIC(18, 2);      -- computed tax on (subtotal - discount)
