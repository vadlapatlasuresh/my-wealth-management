-- Store the full categorized tax-input breakdown (wages, self-employment, rental, interest,
-- dividends, retirement, mortgage interest, SALT, charitable, ...) as JSON, so the detailed
-- estimator form repopulates on reload. The existing aggregate columns are kept for back-compat.

ALTER TABLE tax_profile ADD COLUMN details_json TEXT;
