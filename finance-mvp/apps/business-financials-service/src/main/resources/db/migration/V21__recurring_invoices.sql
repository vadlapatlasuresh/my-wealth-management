-- Order-to-Cash, Phase 1.4a — recurring / subscription invoicing.
--
-- A recurring schedule is an invoice TEMPLATE plus a cadence. A daily job (and a manual
-- "run now" endpoint) materializes a real business_invoice from it whenever it comes due,
-- then advances next_run_date. Generated invoices are ordinary invoices — they flow into
-- AR, the public page, reminders and reconciliation exactly like any other.
CREATE TABLE business_recurring_invoices (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    customer_id BIGINT,                         -- optional saved customer (FK SET NULL)

    customer VARCHAR(255) NOT NULL,             -- inline snapshot copied onto each invoice
    customer_email VARCHAR(255),
    customer_phone VARCHAR(40),

    -- Cadence: generate every interval_count * frequency.
    frequency VARCHAR(12) NOT NULL,             -- WEEKLY | MONTHLY | QUARTERLY | ANNUALLY
    interval_count INT NOT NULL DEFAULT 1,
    start_date DATE NOT NULL,
    end_date DATE,                              -- null = no end
    next_run_date DATE NOT NULL,                -- when the next invoice generates
    due_days INT NOT NULL DEFAULT 0,            -- invoice due_date = issue date + due_days

    status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | PAUSED | ENDED

    -- Money template (same rules as invoices; line items in the child table below).
    discount_type VARCHAR(8),
    discount_value NUMERIC(18, 4),
    tax_rate NUMERIC(7, 4),
    notes VARCHAR(1000),

    last_generated_at TIMESTAMP WITHOUT TIME ZONE,
    generated_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_biz_recurring_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_biz_recurring_customer
        FOREIGN KEY (customer_id) REFERENCES business_customers (id) ON DELETE SET NULL
);
CREATE INDEX idx_biz_recurring_user_biz ON business_recurring_invoices (user_id, business_id);
-- The generator scans ACTIVE schedules that are due.
CREATE INDEX idx_biz_recurring_due ON business_recurring_invoices (status, next_run_date);

CREATE TABLE business_recurring_invoice_items (
    id BIGSERIAL PRIMARY KEY,
    schedule_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    description VARCHAR(500) NOT NULL,
    quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
    unit_price NUMERIC(18, 4) NOT NULL DEFAULT 0,
    amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_recurring_item_schedule
        FOREIGN KEY (schedule_id) REFERENCES business_recurring_invoices (id) ON DELETE CASCADE
);
CREATE INDEX idx_recurring_item_schedule ON business_recurring_invoice_items (schedule_id, position);
CREATE INDEX idx_recurring_item_user ON business_recurring_invoice_items (user_id);
