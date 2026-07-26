-- GL.4 — tamper-evident hash chain over the general ledger.
--
-- Each journal entry stores a keyed HMAC (entry_hash) that covers the previous entry's hash
-- plus this entry's own content (date, source, and its debit/credit lines). Altering or
-- deleting any past row breaks every later hash, which /verify detects. Keying the digest
-- (LEDGER_CHAIN_KEY) means forging history needs DB write access AND a secret not in the DB
-- — the same design the audit-service uses. Chained per business, in id order.
ALTER TABLE ledger_journal_entries ADD COLUMN prev_hash VARCHAR(64);
ALTER TABLE ledger_journal_entries ADD COLUMN entry_hash VARCHAR(64);
