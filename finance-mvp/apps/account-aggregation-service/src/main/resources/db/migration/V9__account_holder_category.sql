-- Plaid account holder category ("business" | "personal" | "unrecognized").
-- Lets the business page auto-detect which linked accounts are business accounts.
-- Nullable; back-filled on the next Plaid sync.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS holder_category VARCHAR(32);
