-- Hot-path indexes. These tables are always queried by user_id (per-user dashboards,
-- net-worth, budgets) and joined by the Plaid item/account FKs (which Postgres does NOT
-- auto-index). UNIQUE columns (plaid_item_id, plaid_account_id) are already indexed.

CREATE INDEX IF NOT EXISTS idx_plaid_items_user   ON plaid_items (user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user      ON accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_item      ON accounts (plaid_item_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user  ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_acct  ON transactions (account_id);
