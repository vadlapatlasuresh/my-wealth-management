-- Enforce one-to-one: a linked (aggregation) account belongs to exactly ONE
-- business. Previously the unique key was (user_id, business_id, linked_account_id),
-- which let the same account be assigned to several businesses — so an account
-- could show up under multiple businesses at once. We now make the account unique
-- per user, so assigning it to a business moves it off any other.
--
-- Dedupe first: if an account is currently assigned to more than one business,
-- keep the earliest assignment (lowest id) and drop the rest, so the new
-- constraint can be added on existing data. Portable form (works on H2 + Postgres).
DELETE FROM business_linked_accounts
  WHERE id NOT IN (
    SELECT keep_id FROM (
      SELECT MIN(id) AS keep_id
      FROM business_linked_accounts
      GROUP BY user_id, linked_account_id
    ) keepers
  );

ALTER TABLE business_linked_accounts DROP CONSTRAINT IF EXISTS uq_biz_linked_acct;
ALTER TABLE business_linked_accounts
  ADD CONSTRAINT uq_biz_linked_acct_per_user UNIQUE (user_id, linked_account_id);
