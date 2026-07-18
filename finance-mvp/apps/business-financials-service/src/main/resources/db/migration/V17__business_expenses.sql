-- First-class expense records per business, backing the Expenses tab on MyBusinessPage.
--
-- IMPORTANT — how this avoids double-counting the ledger:
-- The P&L / spend-by-category widgets derive spend from the merged transaction ledger
-- (Plaid-linked + business_transactions). An expense therefore has a source_mode:
--   STANDALONE — spend NOT represented in the ledger (cash, out-of-pocket receipt).
--                Carries its own `amount` and counts as NEW spend.
--   LINKED     — backed by one or more ledger transactions. `amount` stays NULL and the
--                effective amount is DERIVED from the linked rows, so it never adds to
--                ledger-derived totals; it is a documentation/categorisation wrapper.
CREATE TABLE business_expenses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    expense_date DATE NOT NULL,
    category VARCHAR(80) NOT NULL,
    vendor VARCHAR(200),
    description VARCHAR(500),
    -- Required for STANDALONE; NULL for LINKED (derived from business_expense_links).
    amount NUMERIC(18, 2),
    source_mode VARCHAR(16) NOT NULL DEFAULT 'STANDALONE',   -- STANDALONE | LINKED
    status VARCHAR(24) NOT NULL DEFAULT 'RECORDED',          -- RECORDED | NEEDS_RECEIPT | APPROVED | REIMBURSED
    payment_method VARCHAR(40),
    receipt_document_id BIGINT,                              -- -> business_documents.id
    notes VARCHAR(1000),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_biz_expense_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE
);
CREATE INDEX idx_biz_expense_user_biz ON business_expenses (user_id, business_id);
CREATE INDEX idx_biz_expense_date ON business_expenses (business_id, expense_date);

-- Transactions attached to an expense.
--
-- Deliberately NOT a foreign key to business_transactions: Plaid-linked transactions are
-- fetched at runtime from account-aggregation and are never persisted here. So a link is a
-- polymorphic reference (tx_source + tx_ref) PLUS a denormalised snapshot of the row as it
-- looked when linked — that keeps the expense auditable even if the account is later
-- unlinked or the transaction ages out of the provider window.
CREATE TABLE business_expense_links (
    id BIGSERIAL PRIMARY KEY,
    expense_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    tx_source VARCHAR(16) NOT NULL,        -- MANUAL (business_transactions.id) | LINKED (provider external id)
    tx_ref VARCHAR(200) NOT NULL,
    -- Snapshot at link time.
    tx_date DATE,
    tx_amount NUMERIC(18, 2),
    tx_description VARCHAR(500),
    tx_merchant VARCHAR(200),
    tx_account VARCHAR(200),
    linked_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_biz_expense_link_expense
        FOREIGN KEY (expense_id) REFERENCES business_expenses (id) ON DELETE CASCADE,
    -- Re-linking the same transaction is a no-op rather than a duplicate.
    CONSTRAINT uq_expense_link UNIQUE (expense_id, tx_source, tx_ref)
);
CREATE INDEX idx_biz_expense_link_expense ON business_expense_links (expense_id);
CREATE INDEX idx_biz_expense_link_user ON business_expense_links (user_id);
