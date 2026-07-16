-- Invoicing for small-business owners: send an invoice by email/SMS, let the
-- customer view it on a public page, and reconcile the payment when it arrives.
ALTER TABLE business_invoices ADD COLUMN invoice_number VARCHAR(60);
ALTER TABLE business_invoices ADD COLUMN customer_email VARCHAR(255);
ALTER TABLE business_invoices ADD COLUMN customer_phone VARCHAR(40);
ALTER TABLE business_invoices ADD COLUMN notes VARCHAR(1000);
-- How the customer should pay (Zelle handle, bank details, "check to…", etc.). Shown
-- on the public invoice page.
ALTER TABLE business_invoices ADD COLUMN pay_instructions VARCHAR(1000);
-- Opaque token for the public (unauthenticated) invoice view the customer opens.
ALTER TABLE business_invoices ADD COLUMN share_token VARCHAR(64);
ALTER TABLE business_invoices ADD COLUMN sent_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE business_invoices ADD COLUMN sent_channel VARCHAR(16);
-- Payment reconciliation (manual): when money lands, the owner records it here.
ALTER TABLE business_invoices ADD COLUMN paid_at DATE;
ALTER TABLE business_invoices ADD COLUMN paid_amount NUMERIC(18,2);
ALTER TABLE business_invoices ADD COLUMN payment_method VARCHAR(40);
ALTER TABLE business_invoices ADD COLUMN payment_reference VARCHAR(200);
-- Optional link to the matching business transaction that recorded the deposit.
ALTER TABLE business_invoices ADD COLUMN linked_transaction_id BIGINT;
CREATE UNIQUE INDEX ux_business_invoices_token ON business_invoices (share_token);

-- Business documents can now carry the id of their mirror in the personal Document
-- Center, so the same secure-share (link + passcode + access log) can be reused.
ALTER TABLE business_documents ADD COLUMN central_document_id BIGINT;
