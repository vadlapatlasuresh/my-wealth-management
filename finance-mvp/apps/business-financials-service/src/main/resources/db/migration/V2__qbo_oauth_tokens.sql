-- OAuth2 token storage for the live QuickBooks Online provider.
-- Null in mock mode; populated by the QBO OAuth callback when business.provider=quickbooks.
ALTER TABLE qbo_connections ADD COLUMN access_token VARCHAR(2048);
ALTER TABLE qbo_connections ADD COLUMN refresh_token VARCHAR(2048);
ALTER TABLE qbo_connections ADD COLUMN token_expires_at TIMESTAMP WITHOUT TIME ZONE;
