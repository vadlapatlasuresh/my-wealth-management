-- GL.1 — double-entry general ledger (the QuickBooks-parity accounting substrate).
--
-- Three tables: a per-business chart of accounts, immutable journal entries, and their
-- debit/credit lines. Every financial event elsewhere (invoice issued/paid, bill, payroll…)
-- will post a balanced journal entry here (later slices). Entries are append-only — a
-- correction is a REVERSING entry, never an edit or delete — which is what gives a real
-- audit trail and lets us derive a Balance Sheet / P&L / Cash Flow.
CREATE TABLE ledger_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    code VARCHAR(20) NOT NULL,                 -- account number, e.g. "1000"
    name VARCHAR(160) NOT NULL,
    type VARCHAR(12) NOT NULL,                 -- ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
    -- Normal balance derived from type (ASSET/EXPENSE=DEBIT, others=CREDIT); stored for clarity.
    normal_balance VARCHAR(6) NOT NULL,        -- DEBIT | CREDIT
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_ledger_account_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE,
    CONSTRAINT uq_ledger_account_code UNIQUE (business_id, code)
);
CREATE INDEX idx_ledger_account_user_biz ON ledger_accounts (user_id, business_id);

CREATE TABLE ledger_journal_entries (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,
    entry_date DATE NOT NULL,
    memo VARCHAR(500),
    -- What generated this entry: MANUAL | INVOICE | PAYMENT | BILL | BILL_PAYMENT | PAYROLL |
    -- ADJUSTMENT | REVERSAL … plus the id of the source document it represents.
    source_type VARCHAR(24) NOT NULL DEFAULT 'MANUAL',
    source_ref VARCHAR(64),
    -- When this entry reverses another, points at the original entry's id (append-only model).
    reversal_of BIGINT,
    posted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_ledger_entry_business
        FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE
);
CREATE INDEX idx_ledger_entry_user_biz ON ledger_journal_entries (user_id, business_id);
CREATE INDEX idx_ledger_entry_date ON ledger_journal_entries (business_id, entry_date);
CREATE INDEX idx_ledger_entry_source ON ledger_journal_entries (business_id, source_type, source_ref);

CREATE TABLE ledger_journal_lines (
    id BIGSERIAL PRIMARY KEY,
    entry_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    -- Exactly one of debit / credit is > 0 on a line; both default 0. The service enforces
    -- that SUM(debit) = SUM(credit) across an entry before it is written.
    debit NUMERIC(18, 2) NOT NULL DEFAULT 0,
    credit NUMERIC(18, 2) NOT NULL DEFAULT 0,
    memo VARCHAR(300),
    position INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_ledger_line_entry
        FOREIGN KEY (entry_id) REFERENCES ledger_journal_entries (id) ON DELETE CASCADE,
    CONSTRAINT fk_ledger_line_account
        FOREIGN KEY (account_id) REFERENCES ledger_accounts (id)
);
CREATE INDEX idx_ledger_line_entry ON ledger_journal_lines (entry_id);
CREATE INDEX idx_ledger_line_account ON ledger_journal_lines (account_id);
