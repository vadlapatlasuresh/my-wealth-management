-- Private co-ownership positions (LLC/syndication units) become part of net worth.
--
-- The figure comes from real-estate-service, which decides whether it is the holder's own
-- mark on the position or the capital they still have at risk. This service stores the
-- result and never re-judges it.
--
-- Defaults to 0 rather than NULL so historical snapshots stay comparable: a snapshot taken
-- before this column existed genuinely had no private holdings counted, and the 30-day change
-- calculation subtracts prior values directly.
ALTER TABLE net_worth_snapshots ADD COLUMN private_holdings DECIMAL(19, 2) NOT NULL DEFAULT 0;
