-- The user's own mark on a private position, so net worth reflects an appreciated deal
-- rather than only the cash still at risk.
--
-- This is the holder's estimate of their own asset — the same thing they already enter as
-- current_value against a property they own. TerraVest neither produces nor verifies it, and
-- nothing in the codebase derives a return from it. Left NULL, net worth falls back to
-- unreturned capital, so the rollup is honest before anyone marks anything.

ALTER TABLE private_holdings ADD COLUMN estimated_value DECIMAL(19, 2);
-- When the mark was made, so a stale estimate is visible as stale rather than silently trusted.
ALTER TABLE private_holdings ADD COLUMN valued_on DATE;
