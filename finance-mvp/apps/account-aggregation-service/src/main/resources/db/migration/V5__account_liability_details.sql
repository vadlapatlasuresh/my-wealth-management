-- Credit-card / liability enrichment for linked accounts.
-- All nullable: only credit accounts (and only when Plaid Liabilities is available)
-- populate these; depository/investment accounts leave them NULL.
ALTER TABLE accounts ADD COLUMN mask VARCHAR(32);
ALTER TABLE accounts ADD COLUMN credit_limit DECIMAL(19, 4);
ALTER TABLE accounts ADD COLUMN last_statement_balance DECIMAL(19, 4);
ALTER TABLE accounts ADD COLUMN minimum_payment DECIMAL(19, 4);
ALTER TABLE accounts ADD COLUMN next_payment_due_date DATE;
ALTER TABLE accounts ADD COLUMN apr_percentage DECIMAL(9, 4);
