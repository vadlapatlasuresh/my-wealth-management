-- Convert the Deal Room into a compliant passive bulletin-board directory.
--
-- The board is informational only: it does not vet or endorse listings, give investment
-- advice, or facilitate securities transactions. Storing projected returns, entry prices
-- and raise progress is inconsistent with that posture, so those columns are dropped
-- rather than merely hidden from the UI.

-- 1. Descriptive listing fields replacing the financial ones.
ALTER TABLE deals ADD COLUMN image_urls VARCHAR(2000);      -- newline-separated hosted photo URLs
ALTER TABLE deals ADD COLUMN contact_email VARCHAR(320);
ALTER TABLE deals ADD COLUMN contact_phone VARCHAR(40);

-- 2. Backfill contact + external link before they become required.
--    Existing listings without a website get a placeholder that the owner must edit;
--    NULL would break the NOT NULL constraint and delete-on-migrate is not acceptable.
UPDATE deals SET website_url = 'https://example.invalid/listing-link-required'
 WHERE website_url IS NULL OR trim(website_url) = '';
ALTER TABLE deals ALTER COLUMN website_url SET NOT NULL;

-- 3. Collapse the securities-flavoured categories onto the descriptive ones.
UPDATE deals SET category = 'OTHER'   WHERE category IN ('PRIVATE_EQUITY', 'STARTUP');
UPDATE deals SET subcategory = 'GENERAL'
 WHERE category = 'OTHER' AND subcategory IS NOT NULL AND subcategory <> 'GENERAL';
UPDATE deals SET subcategory = 'GENERAL'
 WHERE category = 'BUSINESS'
   AND subcategory NOT IN ('RETAIL', 'INDUSTRIAL', 'OFFICE', 'HOSPITALITY', 'GENERAL');

-- 4. "FUNDED" describes a completed raise — no longer a state this board models.
UPDATE deals SET status = 'CLOSED' WHERE status = 'FUNDED';

-- 5. Drop every projected-return / entry-price / raise-tracking column.
ALTER TABLE deals DROP COLUMN target_irr;
ALTER TABLE deals DROP COLUMN min_investment;
ALTER TABLE deals DROP COLUMN target_raise;
ALTER TABLE deals DROP COLUMN annual_return_min;
ALTER TABLE deals DROP COLUMN annual_return_max;
ALTER TABLE deals DROP COLUMN return_type;
ALTER TABLE deals DROP COLUMN distribution_frequency;
ALTER TABLE deals DROP COLUMN hold_period_months;
ALTER TABLE deals DROP COLUMN amount_committed;

-- 6. Contact requests become a plain bookmark: no commitment size, no accreditation
--    attestation, no sponsor-side lead pipeline.
ALTER TABLE deal_interests DROP COLUMN commitment_amount;
ALTER TABLE deal_interests DROP COLUMN accredited;
ALTER TABLE deal_interests DROP COLUMN status;

-- 7. Offering documents (PPM, subscription agreements, financials) have no place on a
--    directory that facilitates nothing.
DROP TABLE IF EXISTS deal_documents;

-- 8. A past project's "outcome" was free text for performance claims ("Sold 2023 · 21% IRR").
--    Directory history is descriptive only.
ALTER TABLE sponsor_projects DROP COLUMN outcome;
