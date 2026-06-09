-- Cursor for Plaid /transactions/sync (incremental pull, no webhook needed).
ALTER TABLE plaid_items ADD COLUMN transaction_cursor TEXT;
