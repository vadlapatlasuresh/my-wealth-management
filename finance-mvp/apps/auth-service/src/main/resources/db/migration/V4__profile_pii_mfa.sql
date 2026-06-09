-- Extended KYC profile fields + encrypted PII + MFA preference.
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth   DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line1   VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line2   VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS city            VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS state           VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code     VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS country         VARCHAR(60);
-- Full SSN/EIN, AES-256-GCM encrypted at rest (Base64 ciphertext). UI shows last-4 only.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ssn_encrypted   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ein_encrypted   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified  BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_channel     VARCHAR(10) DEFAULT 'EMAIL';
