-- Land value is the non-depreciable portion of the purchase price. Straight-line
-- residential depreciation = (purchase_price - land_value) / 27.5 years. Nullable so
-- existing rows stay valid; depreciation is treated as 0 until a land value is entered.
ALTER TABLE properties ADD COLUMN land_value DECIMAL(19, 4);
