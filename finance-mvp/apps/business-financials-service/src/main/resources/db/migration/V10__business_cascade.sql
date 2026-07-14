-- Enforce per-business isolation at the database level so deleting or relinking
-- a business (or one of its accounts) can never leave orphaned child rows.
-- Previously the cascade lived only in application code (deleteBusiness); that
-- works but a single missed table silently orphans rows scoped to a dead
-- business. FK constraints make it impossible to forget.
--
-- Any pre-existing orphans (child rows whose parent no longer exists) are
-- cleaned first so the constraints can be added on existing data.

-- business_accounts -> manual_businesses
DELETE FROM business_accounts a
  WHERE NOT EXISTS (SELECT 1 FROM manual_businesses b WHERE b.id = a.business_id);
ALTER TABLE business_accounts
  ADD CONSTRAINT fk_biz_acct_business
  FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE;

-- business_transactions -> manual_businesses
DELETE FROM business_transactions t
  WHERE NOT EXISTS (SELECT 1 FROM manual_businesses b WHERE b.id = t.business_id);
ALTER TABLE business_transactions
  ADD CONSTRAINT fk_biz_tx_business
  FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE;

-- business_transactions -> business_accounts (deleting an account drops its tx)
DELETE FROM business_transactions t
  WHERE NOT EXISTS (SELECT 1 FROM business_accounts a WHERE a.id = t.account_id);
ALTER TABLE business_transactions
  ADD CONSTRAINT fk_biz_tx_account
  FOREIGN KEY (account_id) REFERENCES business_accounts (id) ON DELETE CASCADE;

-- business_invoices -> manual_businesses
DELETE FROM business_invoices i
  WHERE NOT EXISTS (SELECT 1 FROM manual_businesses b WHERE b.id = i.business_id);
ALTER TABLE business_invoices
  ADD CONSTRAINT fk_biz_inv_business
  FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE;

-- business_linked_accounts -> manual_businesses
DELETE FROM business_linked_accounts l
  WHERE NOT EXISTS (SELECT 1 FROM manual_businesses b WHERE b.id = l.business_id);
ALTER TABLE business_linked_accounts
  ADD CONSTRAINT fk_biz_linked_business
  FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE;

-- business_documents -> manual_businesses
DELETE FROM business_documents d
  WHERE NOT EXISTS (SELECT 1 FROM manual_businesses b WHERE b.id = d.business_id);
ALTER TABLE business_documents
  ADD CONSTRAINT fk_biz_docs_business
  FOREIGN KEY (business_id) REFERENCES manual_businesses (id) ON DELETE CASCADE;

-- business_documents -> business_invoices (detach doc when its invoice is deleted,
-- matching the existing application behaviour that keeps the doc in the center).
UPDATE business_documents d SET invoice_id = NULL
  WHERE d.invoice_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM business_invoices i WHERE i.id = d.invoice_id);
ALTER TABLE business_documents
  ADD CONSTRAINT fk_biz_docs_invoice
  FOREIGN KEY (invoice_id) REFERENCES business_invoices (id) ON DELETE SET NULL;
