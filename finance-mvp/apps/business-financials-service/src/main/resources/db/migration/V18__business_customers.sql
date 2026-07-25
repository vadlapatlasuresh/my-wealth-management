-- Order-to-Cash, Phase 1.1 — first-class Customer / Contact records per business.
--
-- Until now an invoice stored its customer inline (name + email + phone on
-- business_invoices). That made repeat billing, saved tax IDs and billing/shipping
-- addresses impossible. A BusinessCustomer is the reusable party an invoice (or a
-- future quote / recurring schedule) is addressed to.
--
-- Back-compat: business_invoices keeps its inline customer_* columns. New invoices
-- may additionally reference a customer via customer_id; the inline snapshot is still
-- populated so historical/public views render unchanged even if the customer is later
-- archived or edited.
CREATE TABLE business_customers (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,

    -- Human label shown on invoices; for a company it's the company name, for an
    -- individual usually "First Last". Always required so a customer is never blank.
    display_name VARCHAR(200) NOT NULL,
    first_name VARCHAR(120),
    last_name VARCHAR(120),
    company VARCHAR(200),

    email VARCHAR(255),
    phone VARCHAR(40),
    mobile VARCHAR(40),                 -- SMS-capable number, preferred for text delivery

    tax_id VARCHAR(60),                 -- EIN / VAT / SSN as the customer supplies it
    -- CARD | ACH | ECHECK | CHECK | CASH | OTHER — drives the default Pay-Now option.
    preferred_payment_method VARCHAR(24),

    -- Billing address.
    billing_line1 VARCHAR(200),
    billing_line2 VARCHAR(200),
    billing_city VARCHAR(120),
    billing_region VARCHAR(120),        -- state / province
    billing_postal VARCHAR(24),
    billing_country VARCHAR(2),         -- ISO-3166 alpha-2

    -- Shipping address; when shipping_same_as_billing the shipping_* columns are ignored.
    shipping_same_as_billing BOOLEAN NOT NULL DEFAULT TRUE,
    shipping_line1 VARCHAR(200),
    shipping_line2 VARCHAR(200),
    shipping_city VARCHAR(120),
    shipping_region VARCHAR(120),
    shipping_postal VARCHAR(24),
    shipping_country VARCHAR(2),

    notes VARCHAR(1000),
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | ARCHIVED
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_biz_customer_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE
);
CREATE INDEX idx_biz_customer_user_biz ON business_customers (user_id, business_id);
CREATE INDEX idx_biz_customer_name ON business_customers (business_id, display_name);

-- Optional link from an invoice to a saved customer. Nullable so legacy invoices and
-- one-off ad-hoc invoices (inline customer only) keep working. SET NULL on delete so
-- removing a customer never destroys an invoice or its audit history.
ALTER TABLE business_invoices
    ADD COLUMN customer_id BIGINT;
ALTER TABLE business_invoices
    ADD CONSTRAINT fk_biz_invoice_customer
        FOREIGN KEY (customer_id) REFERENCES business_customers (id) ON DELETE SET NULL;
CREATE INDEX idx_biz_invoice_customer ON business_invoices (customer_id);
