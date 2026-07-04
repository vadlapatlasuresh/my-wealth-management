-- Link a tracked debt back to the linked Plaid account it was imported from, so the Debt Lab
-- can refresh its balance / APR / minimum payment from the account later. Null for manual debts.
ALTER TABLE debts ADD COLUMN plaid_account_id VARCHAR(255);
