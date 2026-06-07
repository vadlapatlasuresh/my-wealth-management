-- Richer signup profile + identity/phone verification.
-- SSN/EIN are NEVER stored in full — only the last 4 digits are persisted (masked display).
ALTER TABLE users ADD COLUMN first_name VARCHAR(100);
ALTER TABLE users ADD COLUMN last_name VARCHAR(100);
ALTER TABLE users ADD COLUMN phone VARCHAR(30);
ALTER TABLE users ADD COLUMN account_type VARCHAR(20);
ALTER TABLE users ADD COLUMN business_name VARCHAR(200);
ALTER TABLE users ADD COLUMN ssn_last4 VARCHAR(4);
ALTER TABLE users ADD COLUMN ein_last4 VARCHAR(4);
ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN identity_verified BOOLEAN DEFAULT FALSE;
