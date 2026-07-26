-- Order-to-Cash, Phase 1.4b — progress / milestone invoicing.
--
-- A project has a fixed contract total and a set of milestones (deposit, midpoint,
-- completion…). Billing a milestone materializes a real invoice for that slice and marks
-- the milestone INVOICED, so "billed to date" and "remaining" draw down against the total.
-- Generated invoices are ordinary invoices — they flow into AR / public page / reconciliation.
CREATE TABLE business_projects (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    customer_id BIGINT,                         -- optional saved customer (FK SET NULL)

    customer VARCHAR(255) NOT NULL,             -- inline snapshot copied onto each invoice
    customer_email VARCHAR(255),
    customer_phone VARCHAR(40),

    name VARCHAR(200) NOT NULL,
    contract_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
    status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | COMPLETED | ARCHIVED
    notes VARCHAR(1000),

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_biz_project_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE,
    CONSTRAINT fk_biz_project_customer
        FOREIGN KEY (customer_id) REFERENCES business_customers (id) ON DELETE SET NULL
);
CREATE INDEX idx_biz_project_user_biz ON business_projects (user_id, business_id);

CREATE TABLE business_project_milestones (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    name VARCHAR(200) NOT NULL,
    -- The slice to bill. amount is authoritative; percent (of contract) is optional metadata
    -- captured when the milestone was defined as a percentage.
    amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    percent NUMERIC(7, 4),
    due_date DATE,
    -- PENDING (not billed) | INVOICED (an invoice was generated)
    status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    invoice_id BIGINT,                          -- the generated invoice (business_invoices.id)
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_project_milestone_project
        FOREIGN KEY (project_id) REFERENCES business_projects (id) ON DELETE CASCADE
);
CREATE INDEX idx_project_milestone_project ON business_project_milestones (project_id, position);
CREATE INDEX idx_project_milestone_user ON business_project_milestones (user_id);
