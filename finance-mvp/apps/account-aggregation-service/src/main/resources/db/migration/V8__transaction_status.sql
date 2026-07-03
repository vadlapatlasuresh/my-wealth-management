-- Transaction status tracking + merchant name.
-- `pending` powers pending/cleared status on the transaction views (business page,
-- Transactions page). Nullable so existing rows are unaffected (treated as cleared).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_name VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pending BOOLEAN;
