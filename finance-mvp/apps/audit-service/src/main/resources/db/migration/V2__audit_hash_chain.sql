-- Tamper-evident hash chain: each row links to the previous row's hash.
ALTER TABLE audit_events ADD COLUMN prev_hash  VARCHAR(64);
ALTER TABLE audit_events ADD COLUMN entry_hash VARCHAR(64);
