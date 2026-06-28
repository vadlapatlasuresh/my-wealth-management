-- Carrying-cost / financing details for a property. All nullable so existing rows
-- (and properties saved with just an address) remain valid — backwards compatible.
ALTER TABLE properties ADD COLUMN apr DECIMAL(6, 3);              -- mortgage APR, percent (e.g. 6.500)
ALTER TABLE properties ADD COLUMN monthly_payment DECIMAL(19, 4); -- mortgage payment (P&I)
ALTER TABLE properties ADD COLUMN monthly_tax DECIMAL(19, 4);     -- property tax, per month
ALTER TABLE properties ADD COLUMN monthly_insurance DECIMAL(19, 4);
ALTER TABLE properties ADD COLUMN monthly_hoa DECIMAL(19, 4);
ALTER TABLE properties ADD COLUMN monthly_pmi DECIMAL(19, 4);     -- PMI, per month (rentals, optional)
